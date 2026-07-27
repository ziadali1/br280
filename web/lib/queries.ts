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

export interface CollectionHealth {
  filledSlots: number; // slots de hora com leitura ok nas últimas 24h
  totalSlots: number; // 24
}

export interface ExtremeReading {
  weekday: number;
  hour: number;
  date: string;
  seconds: number;
  text: string | null;
}

export interface Extremes {
  worst: ExtremeReading | null;
  best: ExtremeReading | null;
}

/** Saúde da coleta: slots de hora preenchidos nas últimas 24h (mesma
 * lógica de completude do scraper/verify_health.py). */
export async function getCollectionHealth(): Promise<CollectionHealth> {
  if (!hasDb) return { filledSlots: 0, totalSlots: 24 };
  const rows = (await sql`
    SELECT COUNT(DISTINCT date_trunc('hour', collected_at))::int AS filled
    FROM traffic_readings
    WHERE status = 'ok' AND kind = 'total'
      AND collected_at >= date_trunc('hour', now()) - INTERVAL '24 hours'
      AND collected_at <  date_trunc('hour', now())
  `) as Record<string, unknown>[];
  return { filledSlots: (rows[0]?.filled as number) ?? 0, totalSlots: 24 };
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
    WHERE direction = ${direction} AND status = 'ok' AND kind = 'total'
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
    WHERE direction = ${direction} AND status = 'ok' AND kind = 'total'
      AND duration_seconds IS NOT NULL
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
    WHERE direction = ${direction} AND status = 'ok' AND kind = 'total'
      AND duration_seconds IS NOT NULL
    GROUP BY local_hour
    ORDER BY local_hour
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    hour: r.hour as number,
    avgSeconds: r.avg_seconds as number,
    samples: r.samples as number,
  }));
}

function toExtreme(rows: Record<string, unknown>[]): ExtremeReading | null {
  const r = rows[0];
  if (!r) return null;
  return {
    weekday: r.weekday as number,
    hour: r.hour as number,
    date: r.date as string,
    seconds: r.seconds as number,
    text: (r.text as string) ?? null,
  };
}

/** Pior e melhor leitura única já registrada (rota total) para a direção. */
export async function getExtremes(direction: Direction): Promise<Extremes> {
  if (!hasDb) return { worst: null, best: null };
  const [worstRows, bestRows] = await Promise.all([
    sql`
      SELECT weekday, local_hour AS hour, local_date::text AS date,
             duration_seconds AS seconds, duration_text AS text
      FROM traffic_readings
      WHERE direction = ${direction} AND kind = 'total' AND status = 'ok'
        AND duration_seconds IS NOT NULL
      ORDER BY duration_seconds DESC LIMIT 1
    ` as Promise<Record<string, unknown>[]>,
    sql`
      SELECT weekday, local_hour AS hour, local_date::text AS date,
             duration_seconds AS seconds, duration_text AS text
      FROM traffic_readings
      WHERE direction = ${direction} AND kind = 'total' AND status = 'ok'
        AND duration_seconds IS NOT NULL
      ORDER BY duration_seconds ASC LIMIT 1
    ` as Promise<Record<string, unknown>[]>,
  ]);
  return { worst: toExtreme(worstRows), best: toExtreme(bestRows) };
}

/** Congestionamento por sub-trecho. `hourFrom`/`hourTo` opcionais restringem
 * a um período (ex: 17–19h = pico da tarde). Sem eles, usa todas as horas. */
export async function getSegmentStats(
  direction: Direction,
  hourFrom?: number,
  hourTo?: number
): Promise<SegmentStat[]> {
  if (!hasDb) return [];
  // Média é calculada só no período (FILTER); a baseline p10 usa TODAS as horas,
  // para o ratio comparar o pico contra o fluxo livre global (não o p10 do pico).
  // A condição é inlinada (o driver do neon não aceita fragmentos SQL aninhados).
  const from = hourFrom ?? null;
  const to = hourTo ?? null;
  const rows = (await sql`
    SELECT segment_index,
           MAX(segment_name) AS name,
           AVG(duration_seconds) FILTER (
             WHERE ${from}::int IS NULL
                OR local_hour BETWEEN ${from}::int AND ${to}::int
           )::float AS avg_seconds,
           PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY duration_seconds)::float
                                    AS baseline_seconds,
           COUNT(*) FILTER (
             WHERE ${from}::int IS NULL
                OR local_hour BETWEEN ${from}::int AND ${to}::int
           )::int AS samples
    FROM traffic_readings
    WHERE direction = ${direction}
      AND kind = 'segment'
      AND status = 'ok'
      AND duration_seconds IS NOT NULL
    GROUP BY segment_index
    ORDER BY segment_index
  `) as Record<string, unknown>[];
  return rows
    .filter((r) => r.avg_seconds != null) // sem leituras nesse período -> omite (mapa mostra cinza)
    .map((r) => {
      const avg = r.avg_seconds as number;
      const base = (r.baseline_seconds as number) || avg;
      return {
        segmentIndex: r.segment_index as number,
        name: (r.name as string) ?? `Trecho ${r.segment_index}`,
        avgSeconds: avg,
        baselineSeconds: base,
        ratio: base > 0 ? Math.max(1, avg / base) : 1,
        samples: r.samples as number,
      };
    });
}
