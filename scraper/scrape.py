"""Coletor de trânsito Google Maps -> PostgreSQL.

Para cada rota em config.ROUTES, abre o Google Maps Directions em um
navegador headless, lê o tempo de viagem "no trânsito" e a distância, e
grava uma linha em `traffic_readings`.

Escrito de forma defensiva: o HTML do Maps muda com frequência, então usamos
várias estratégias de extração e, em caso de falha, salvamos screenshot + HTML
em scraper/artifacts/ para facilitar a manutenção.

Variáveis de ambiente:
    DATABASE_URL  - string de conexão Postgres (obrigatória)
    HEADLESS      - "0" para abrir o navegador visível (debug local). Default headless.
"""

from __future__ import annotations

import datetime as dt
import os
import pathlib
import re
import sys
from urllib.parse import quote
from zoneinfo import ZoneInfo

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

from config import ROUTES, TIMEZONE

# Garante UTF-8 na saída (console do Windows usa cp1252 por padrão).
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

SP_TZ = ZoneInfo(TIMEZONE)
ROOT = pathlib.Path(__file__).resolve().parent
SCHEMA_PATH = ROOT.parent / "db" / "schema.sql"
ARTIFACTS = ROOT / "artifacts"

NAV_TIMEOUT_MS = 45_000
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def parse_duration_to_seconds(text: str) -> int | None:
    """'1 h 6 min' -> 3960. Aceita 'h'/'hora(s)' e 'min'/'minuto(s)'."""
    if not text:
        return None
    hours = re.search(r"(\d+)\s*(?:h|hora)", text)
    mins = re.search(r"(\d+)\s*min", text)
    if not hours and not mins:
        return None
    total = 0
    if hours:
        total += int(hours.group(1)) * 3600
    if mins:
        total += int(mins.group(1)) * 60
    return total or None


def parse_distance_to_meters(text: str) -> int | None:
    """'68,2 km' -> 68200 ; '1.234,5 km' -> 1234500 ; '850 m' -> 850."""
    if not text:
        return None
    km = re.search(r"([\d.]+,?\d*)\s*km", text)
    if km:
        raw = km.group(1).replace(".", "").replace(",", ".")
        try:
            return int(float(raw) * 1000)
        except ValueError:
            return None
    m = re.search(r"(\d+)\s*m\b", text)
    if m:
        return int(m.group(1))
    return None


def extract_route_summary(text: str) -> str | None:
    """Pega a primeira linha 'via ...' do card."""
    m = re.search(r"(via [^\n]+)", text)
    return m.group(1).strip() if m else None


# --------------------------------------------------------------------------- #
# Navegação
# --------------------------------------------------------------------------- #
def build_url(origin: str, destination: str) -> str:
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={quote(origin)}"
        f"&destination={quote(destination)}"
        "&travelmode=driving&hl=pt-BR&gl=BR"
    )


def dismiss_consent(page) -> None:
    """Tenta fechar a tela de consentimento de cookies do Google (UE/global)."""
    labels = [
        "Aceitar tudo",
        "Aceito",
        "Accept all",
        "Concordo",
        "Rejeitar tudo",
        "Reject all",
    ]
    for label in labels:
        try:
            btn = page.get_by_role("button", name=re.compile(label, re.I))
            if btn.count() > 0:
                btn.first.click(timeout=3000)
                page.wait_for_timeout(1500)
                return
        except Exception:
            continue


# Bloco do resumo da rota: uma duração ("54 min" / "1 h 6 min") seguida, em até
# ~30 caracteres, da distância ("53,1 km"). Os dois aparecem sempre adjacentes no
# painel; ancorar nesse par evita pegar números soltos da página.
ROUTE_BLOCK_RE = re.compile(
    r"((?:\d+\s*h\s*)?\d+\s*min)[\s\S]{0,30}?([\d.]+,?\d*\s*km)",
    re.IGNORECASE,
)
# Mesma ideia em JS para esperar o bloco renderizar.
ROUTE_READY_JS = (
    "() => /\\d+\\s*min[\\s\\S]{0,30}?[\\d.,]+\\s*km/.test(document.body.innerText)"
)


def extract_reading(page) -> dict:
    """Lê duração + distância + via do resumo da rota. Levanta se não achar."""
    # Espera o bloco de rota (duração + km) aparecer no texto da página.
    try:
        page.wait_for_function(ROUTE_READY_JS, timeout=NAV_TIMEOUT_MS)
    except PWTimeout:
        pass  # tenta extrair mesmo assim; pode ter renderizado parcialmente

    body = page.inner_text("body")
    match = ROUTE_BLOCK_RE.search(body)
    if not match:
        raise RuntimeError("bloco de rota (duração + distância) não encontrado")

    duration_text = re.sub(r"\s+", " ", match.group(1)).strip()
    distance_text = re.sub(r"\s+", " ", match.group(2)).strip()
    duration_s = parse_duration_to_seconds(duration_text)
    distance_m = parse_distance_to_meters(distance_text)

    if duration_s is None:
        raise RuntimeError(f"não consegui parsear a duração: {duration_text!r}")

    return {
        "duration_seconds": duration_s,
        "duration_text": duration_text,
        "distance_meters": distance_m,
        "distance_text": distance_text,
        "route_summary": extract_route_summary(body),
    }


def scrape_route(page, route: dict) -> dict:
    url = build_url(route["origin"], route["destination"])
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    dismiss_consent(page)
    # dá tempo do roteamento com trânsito renderizar
    page.wait_for_timeout(4000)
    return extract_reading(page)


# --------------------------------------------------------------------------- #
# Banco de dados
# --------------------------------------------------------------------------- #
def get_conn():
    import psycopg2  # import lazy: só necessário quando vai gravar

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERRO: variável de ambiente DATABASE_URL não definida.")
    return psycopg2.connect(url)


def ensure_schema(conn) -> None:
    with conn.cursor() as cur, open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        cur.execute(f.read())
    conn.commit()


def insert_reading(conn, route: dict, now_utc: dt.datetime, now_sp: dt.datetime,
                   data: dict | None, status: str, error: str | None) -> None:
    data = data or {}
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO traffic_readings (
                collected_at, collected_at_local, local_date, local_hour, weekday,
                direction, origin, destination,
                duration_seconds, duration_text, distance_meters, distance_text,
                route_summary, source, status, error
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (direction, local_date, local_hour)
                WHERE status = 'ok' DO NOTHING
            """,
            (
                now_utc, now_sp.replace(tzinfo=None), now_sp.date(), now_sp.hour,
                now_sp.weekday(), route["direction"], route["origin"], route["destination"],
                data.get("duration_seconds"), data.get("duration_text"),
                data.get("distance_meters"), data.get("distance_text"),
                data.get("route_summary"), "google_maps_scrape", status, error,
            ),
        )
    conn.commit()


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def dump_artifacts(page, tag: str) -> None:
    try:
        ARTIFACTS.mkdir(exist_ok=True)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        page.screenshot(path=str(ARTIFACTS / f"{tag}_{stamp}.png"), full_page=True)
        (ARTIFACTS / f"{tag}_{stamp}.html").write_text(page.content(), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"  (não consegui salvar artifacts: {exc})")


def main() -> int:
    now_utc = dt.datetime.now(dt.timezone.utc)
    now_sp = now_utc.astimezone(SP_TZ)
    print(f"== Coleta {now_sp:%Y-%m-%d %H:%M} (São Paulo) ==")

    # DRY_RUN=1 valida só a extração, sem tocar no banco (teste local).
    dry_run = os.environ.get("DRY_RUN") == "1"
    conn = None
    if dry_run:
        print("(DRY_RUN: não grava no banco)")
    else:
        conn = get_conn()
        ensure_schema(conn)

    headless = os.environ.get("HEADLESS", "1") != "0"
    failures = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            locale="pt-BR",
            timezone_id=TIMEZONE,
            user_agent=USER_AGENT,
            viewport={"width": 1366, "height": 900},
        )
        page = context.new_page()
        page.set_default_timeout(NAV_TIMEOUT_MS)

        for route in ROUTES:
            print(f"-> {route['label']}")
            try:
                data = scrape_route(page, route)
                if not dry_run:
                    insert_reading(conn, route, now_utc, now_sp, data, "ok", None)
                print(
                    f"   OK: {data.get('duration_text')} "
                    f"({data.get('duration_seconds')}s), {data.get('distance_text')}"
                )
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"   FALHOU: {exc}")
                dump_artifacts(page, route["direction"])
                if not dry_run:
                    insert_reading(conn, route, now_utc, now_sp, None, "failed", str(exc))

        context.close()
        browser.close()

    if conn is not None:
        conn.close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
