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

export interface SegmentStat {
  segmentIndex: number;
  name: string;
  avgSeconds: number;
  baselineSeconds: number; // fluxo livre (mínimo observado)
  ratio: number; // avgSeconds / baselineSeconds (>1 = congestionado)
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

/** Congestionamento por sub-trecho. `hour` opcional filtra por faixa horária. */
export async function getSegmentStats(
  direction: Direction,
  hour?: number
): Promise<SegmentStat[]> {
  if (!hasDb) return [];
  const rows = (await sql`
    SELECT segment_index,
           MAX(segment_name)        AS name,
           AVG(duration_seconds)::float AS avg_seconds,
           MIN(duration_seconds)::int   AS baseline_seconds,
           COUNT(*)::int            AS samples
    FROM traffic_readings
    WHERE direction = ${direction}
      AND kind = 'segment'
      AND status = 'ok'
      AND duration_seconds IS NOT NULL
      AND (${hour ?? null}::int IS NULL OR local_hour = ${hour ?? null}::int)
    GROUP BY segment_index
    ORDER BY segment_index
  `) as Record<string, unknown>[];
  return rows.map((r) => {
    const avg = r.avg_seconds as number;
    const base = (r.baseline_seconds as number) || avg;
    return {
      segmentIndex: r.segment_index as number,
      name: (r.name as string) ?? `Trecho ${r.segment_index}`,
      avgSeconds: avg,
      baselineSeconds: base,
      ratio: base > 0 ? avg / base : 1,
      samples: r.samples as number,
    };
  });
}
