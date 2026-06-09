"""Verificação de saúde da coleta (issue #3).

Roda em CI ~2x/dia. Consulta o banco e valida que a série temporal está
saudável. Sai com código != 0 se qualquer checagem reprovar — o que faz o
workflow falhar e o GitHub notificar o dono do repo por e-mail.

Checagens:
  1. Frescor      — existe leitura ok (kind='total') nas últimas FRESH_HOURS?
  2. Completude   — % de slots de hora preenchidos nas últimas 24h >= MIN_COMPLETENESS?
  3. Taxa de falha — % de linhas failed nas últimas 24h <= MAX_FAILURE_RATE?

Variáveis de ambiente:
    DATABASE_URL  - string de conexão Postgres (obrigatória)
"""

from __future__ import annotations

import os
import sys

# ---- Limiares (ajuste aqui) ------------------------------------------------
FRESH_HOURS = 3          # máximo de horas desde a última leitura ok
MIN_COMPLETENESS = 0.7   # mínimo de slots de hora preenchidos nas últimas 24h
MAX_FAILURE_RATE = 0.2   # máximo de leituras com status='failed' nas últimas 24h
# -----------------------------------------------------------------------------

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass


def main() -> int:
    import psycopg2

    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERRO: DATABASE_URL não definida.")
        return 2

    conn = psycopg2.connect(url)
    cur = conn.cursor()
    problems: list[str] = []

    # 1. Frescor: horas desde a última leitura ok da rota total
    cur.execute(
        """
        SELECT EXTRACT(EPOCH FROM (now() - MAX(collected_at))) / 3600.0
        FROM traffic_readings
        WHERE status = 'ok' AND kind = 'total'
        """
    )
    age_h = cur.fetchone()[0]
    if age_h is None:
        problems.append("Frescor: nenhuma leitura ok encontrada no banco.")
        print("1. Frescor: FALHOU (banco vazio)")
    elif age_h > FRESH_HOURS:
        problems.append(
            f"Frescor: última leitura ok há {age_h:.1f}h (limite {FRESH_HOURS}h)."
        )
        print(f"1. Frescor: FALHOU ({age_h:.1f}h)")
    else:
        print(f"1. Frescor: OK (última leitura há {age_h:.1f}h)")

    # 2. Completude: slots de hora (UTC) com leitura ok nas últimas 24h.
    # Ignora a hora corrente (slot ainda em aberto).
    cur.execute(
        """
        SELECT COUNT(DISTINCT date_trunc('hour', collected_at))
        FROM traffic_readings
        WHERE status = 'ok' AND kind = 'total'
          AND collected_at >= date_trunc('hour', now()) - INTERVAL '24 hours'
          AND collected_at <  date_trunc('hour', now())
        """
    )
    filled = cur.fetchone()[0] or 0
    completeness = filled / 24.0
    if completeness < MIN_COMPLETENESS:
        problems.append(
            f"Completude: {filled}/24 slots nas últimas 24h "
            f"({completeness:.0%}, mínimo {MIN_COMPLETENESS:.0%})."
        )
        print(f"2. Completude: FALHOU ({filled}/24 slots)")
    else:
        print(f"2. Completude: OK ({filled}/24 slots, {completeness:.0%})")

    # 3. Taxa de falha nas últimas 24h (todas as medições)
    cur.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE status = 'failed')::float,
            COUNT(*)::float
        FROM traffic_readings
        WHERE collected_at >= now() - INTERVAL '24 hours'
        """
    )
    failed, total = cur.fetchone()
    rate = (failed / total) if total else 0.0
    if total and rate > MAX_FAILURE_RATE:
        problems.append(
            f"Taxa de falha: {rate:.0%} ({int(failed)}/{int(total)}) nas últimas "
            f"24h (máximo {MAX_FAILURE_RATE:.0%})."
        )
        print(f"3. Taxa de falha: FALHOU ({rate:.0%})")
    else:
        print(f"3. Taxa de falha: OK ({rate:.0%} de {int(total)} medições)")

    conn.close()

    if problems:
        print("\n=== COLETA COM PROBLEMAS ===")
        for p in problems:
            print(f" - {p}")
        return 1

    print("\nColeta saudável.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
