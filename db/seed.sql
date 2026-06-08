-- Dados de exemplo para testar o dashboard sem esperar o coletor.
-- Gera ~30 dias de leituras sintéticas (5h–00h) para as duas direções,
-- com tempos maiores nos horários de pico. NÃO use em produção.
--
-- Uso:  psql "$DATABASE_URL" -f db/seed.sql

INSERT INTO traffic_readings (
    collected_at, collected_at_local, local_date, local_hour, weekday,
    direction, origin, destination,
    duration_seconds, duration_text, distance_meters, distance_text,
    route_summary, source, status
)
SELECT
    (d + make_interval(hours => h)) AT TIME ZONE 'America/Sao_Paulo'         AS collected_at,
    (d + make_interval(hours => h))                                          AS collected_at_local,
    d::date                                                                  AS local_date,
    h                                                                        AS local_hour,
    EXTRACT(ISODOW FROM d)::int - 1                                          AS weekday,
    dir.direction,
    'origem exemplo', 'destino exemplo',
    base.secs, NULL, 53100, '53,1 km', 'via BR-280 e BR-101',
    'seed', 'ok'
FROM generate_series(
        (CURRENT_DATE - INTERVAL '30 days'),
        CURRENT_DATE,
        INTERVAL '1 day'
     ) AS d
CROSS JOIN generate_series(5, 23) AS h
CROSS JOIN (VALUES ('ida'), ('volta')) AS dir(direction)
CROSS JOIN LATERAL (
    SELECT (
        2400                                                    -- base ~40 min
        + CASE WHEN h IN (7, 8, 17, 18, 19) THEN 1500 ELSE 0 END  -- picos
        + CASE WHEN h IN (6, 9, 16, 20) THEN 600 ELSE 0 END
        + CASE WHEN EXTRACT(ISODOW FROM d) >= 6 THEN -300 ELSE 0 END -- fim de semana
        + (random() * 400)::int
    )::int AS secs
) AS base
ON CONFLICT (direction, local_date, local_hour) WHERE status = 'ok' DO NOTHING;
