"""Gera segments.json (uma vez): divide a rota SFS->Joinville em N trechos.

Usa o OSRM (roteador gratuito, sem chave) para obter a geometria real da via
e o Nominatim (OpenStreetMap) para nomear cada trecho. O resultado é commitado
e consumido tanto pelo coletor (coordenadas dos limites) quanto pelo mapa do
frontend (geometria para desenhar).

Uso:  python build_segments.py
"""

from __future__ import annotations

import json
import math
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "segments.json"

# Extremos da rota (lat, lng) e um ponto intermediário para forçar o corredor
# real (BR-280 por Araquari), evitando que o OSRM escolha um atalho.
ORIGIN = (-26.2426, -48.6383)   # Rua Fernandes Dias, 322 - Centro, S. F. do Sul
ARAQUARI = (-26.3705, -48.7218)  # cidade no caminho
DEST = (-26.3045, -48.8456)     # Shopping Mueller Joinville - Centro

N_SEGMENTS = 5
UA = {"User-Agent": "br280-portfolio/1.0 (projeto de engenharia de dados)"}


def osrm_route(points: list[tuple[float, float]]) -> list[list[float]]:
    """Retorna a geometria [[lng, lat], ...] passando pelos pontos (lat,lng)."""
    coords = ";".join(f"{lng},{lat}" for lat, lng in points)
    url = (
        f"http://router.project-osrm.org/route/v1/driving/{coords}"
        "?overview=full&geometries=geojson"
    )
    req = urllib.request.Request(url, headers=UA)
    data = json.load(urllib.request.urlopen(req, timeout=30))
    return data["routes"][0]["geometry"]["coordinates"]


def haversine(a: list[float], b: list[float]) -> float:
    """Distância em metros entre [lng,lat] e [lng,lat]."""
    (lng1, lat1), (lng2, lat2) = a, b
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def reverse_geocode(lat: float, lng: float) -> str:
    """Nome curto do lugar mais próximo (via Nominatim)."""
    params = urllib.parse.urlencode(
        {"lat": lat, "lon": lng, "format": "json", "zoom": 14, "accept-language": "pt-BR"}
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(url, headers=UA)
    try:
        addr = json.load(urllib.request.urlopen(req, timeout=30)).get("address", {})
    except Exception:  # noqa: BLE001
        return ""
    road = addr.get("road")
    place = (
        addr.get("suburb")
        or addr.get("town")
        or addr.get("village")
        or addr.get("city")
        or addr.get("municipality")
        or addr.get("county")
    )
    parts = [p for p in (road, place) if p]
    return " · ".join(dict.fromkeys(parts))  # remove duplicatas mantendo ordem


def main() -> None:
    print("Obtendo geometria no OSRM...")
    geom = osrm_route([ORIGIN, ARAQUARI, DEST])  # [[lng,lat], ...]
    total_m = sum(haversine(geom[i], geom[i + 1]) for i in range(len(geom) - 1))
    print(f"  {len(geom)} pontos, {total_m/1000:.1f} km")

    # Distância acumulada por ponto da geometria
    cum = [0.0]
    for i in range(1, len(geom)):
        cum.append(cum[-1] + haversine(geom[i - 1], geom[i]))

    # Índices que dividem a rota em N_SEGMENTS por distância igual
    bounds_idx = []
    for k in range(N_SEGMENTS + 1):
        target = total_m * k / N_SEGMENTS
        j = min(range(len(cum)), key=lambda i: abs(cum[i] - target))
        bounds_idx.append(j)

    segments = []
    for k in range(N_SEGMENTS):
        i0, i1 = bounds_idx[k], bounds_idx[k + 1]
        slice_geom = geom[i0 : i1 + 1]
        # converte [lng,lat] -> [lat,lng] para o Leaflet
        latlng = [[p[1], p[0]] for p in slice_geom]
        mid = slice_geom[len(slice_geom) // 2]
        print(f"Nomeando trecho {k+1}/{N_SEGMENTS}...")
        name = reverse_geocode(mid[1], mid[0]) or f"Trecho {k+1}"
        time.sleep(1.1)  # respeita o rate limit do Nominatim
        seg_m = cum[i1] - cum[i0]
        segments.append(
            {
                "index": k,
                "name": name,
                "from": [latlng[0][0], latlng[0][1]],   # [lat,lng]
                "to": [latlng[-1][0], latlng[-1][1]],
                "distance_m": round(seg_m),
                "geometry": latlng,
            }
        )
        print(f"  -> {name} ({seg_m/1000:.1f} km)")

    OUT.write_text(json.dumps({"segments": segments}, ensure_ascii=False, indent=2), "utf-8")
    print(f"\nGravado {OUT} com {len(segments)} trechos.")


if __name__ == "__main__":
    main()
