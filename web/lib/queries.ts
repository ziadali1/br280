import { sql, hasDb } from "./db";

export type Direction = "ida" | "volta";

export interface Overview {
  total: number;
  firstDate: string | null;
  lastCollected: string | null;
  lastDurationText: string | null;
}

export interface HeatCell {
  weekday: number; // 0=Seg ... 6=Dom
  hour: number; // 0-23
  avgSeconds: number;
  samples: number;
}

export interface HourStat {
  hour: number;
  avgSeconds: number;
  samples: number;
}

/** Resumo de uma direção. */
export async function getOverview(direction: Direction): Promise<Overview> {
  if (!hasDb) return { total: 0, firstDate: null, lastCollected: null, lastDurationText: null };
  const rows = (await sql`
    SELECT
      COUNT(*)::int                                  AS total,
      MIN(local_date)::text                          AS first_date,
      MAX(collected_at_local)::text                  AS last_collected,
      (ARRAY_AGG(duration_text ORDER BY collected_at DESC))[1] AS last_duration_text
    FROM traffic_readings
    WHERE direction = ${direction} AND status = 'ok'
  `) as Record<string, unknown>[];
  const r = rows[0] ?? {};
  return {
    total: (r.total as number) ?? 0,
    firstDate: (r.first_date as string) ?? null,
    lastCollected: (r.last_collected as string) ?? null,
    lastDurationText: (r.last_duration_text as string) ?? null,
  };
}

/** Média de duração por dia-da-semana x hora. */
export async function getHeatmap(direction: Direction): Promise<HeatCell[]> {
  if (!hasDb) return [];
  const rows = (await sql`
    SELECT weekday, local_hour AS hour,
           AVG(duration_seconds)::float AS avg_seconds,
           COUNT(*)::int AS samples
    FROM traffic_readings
    WHERE direction = ${direction} AND status = 'ok' AND duration_seconds IS NOT NULL
    GROUP BY weekday, local_hour
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    weekday: r.weekday as number,
    hour: r.hour as number,
    avgSeconds: r.avg_seconds as number,
    samples: r.samples as number,
  }));
}

/** Média de duração por hora (todos os dias). Base do ranking de melhores horários. */
export async function getHourStats(direction: Direction): Promise<HourStat[]> {
  if (!hasDb) return [];
  const rows = (await sql`
    SELECT local_hour AS hour,
           AVG(duration_seconds)::float AS avg_seconds,
           COUNT(*)::int AS samples
    FROM traffic_readings
    WHERE direction = ${direction} AND status = 'ok' AND duration_seconds IS NOT NULL
    GROUP BY local_hour
    ORDER BY local_hour
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    hour: r.hour as number,
    avgSeconds: r.avg_seconds as number,
    samples: r.samples as number,
  }));
}
