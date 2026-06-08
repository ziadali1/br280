-- Schema do projeto: Trânsito São Francisco do Sul <-> Joinville
-- Banco: PostgreSQL (Neon free tier)
-- Uma linha por leitura de trânsito (uma direção, um horário).

CREATE TABLE IF NOT EXISTS traffic_readings (
    id                  BIGSERIAL PRIMARY KEY,

    -- Quando a coleta foi feita
    collected_at        TIMESTAMPTZ NOT NULL,            -- instante UTC da coleta
    collected_at_local  TIMESTAMP   NOT NULL,            -- mesmo instante em horário de São Paulo
    local_date          DATE        NOT NULL,            -- data local (SP)
    local_hour          SMALLINT    NOT NULL,            -- hora local 0-23
    weekday             SMALLINT    NOT NULL,            -- 0=segunda ... 6=domingo (datetime.weekday)

    -- Trecho
    direction           TEXT NOT NULL CHECK (direction IN ('ida', 'volta')),
    origin              TEXT NOT NULL,
    destination         TEXT NOT NULL,

    -- Medições
    duration_seconds        INTEGER,        -- tempo no trânsito (segundos)
    duration_text           TEXT,           -- texto cru exibido ("1 h 6 min")
    duration_typical_seconds INTEGER,       -- tempo típico sem trânsito, quando disponível
    distance_meters         INTEGER,
    distance_text           TEXT,
    route_summary           TEXT,           -- ex: "via BR-280"

    -- Metadados
    source              TEXT NOT NULL DEFAULT 'google_maps_scrape',
    status              TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed')),
    error               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para as consultas do dashboard
CREATE INDEX IF NOT EXISTS idx_readings_direction_hour
    ON traffic_readings (direction, local_hour);

CREATE INDEX IF NOT EXISTS idx_readings_direction_weekday_hour
    ON traffic_readings (direction, weekday, local_hour);

CREATE INDEX IF NOT EXISTS idx_readings_collected_at
    ON traffic_readings (collected_at DESC);

-- Evita gravar duas leituras "ok" da mesma direção na mesma data/hora local
CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_slot
    ON traffic_readings (direction, local_date, local_hour)
    WHERE status = 'ok';
