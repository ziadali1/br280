import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { Direction, getSegmentStats } from "@/lib/queries";
import { SegmentMap, MapSegment } from "@/components/SegmentMap";
import { Nav } from "@/components/Nav";
import { ratioColor, ratioLabel, fmtDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SegGeo {
  index: number;
  name: string;
  geometry: [number, number][];
}

async function loadGeometry(): Promise<SegGeo[]> {
  const raw = await readFile(
    path.join(process.cwd(), "public", "segments.json"),
    "utf-8"
  );
  return JSON.parse(raw).segments as SegGeo[];
}

const LABEL: Record<Direction, string> = {
  ida: "São Francisco do Sul → Joinville",
  volta: "Joinville → São Francisco do Sul",
};

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string }>;
}) {
  const params = await searchParams;
  const direction: Direction = params.dir === "volta" ? "volta" : "ida";

  const [geo, stats] = await Promise.all([
    loadGeometry(),
    getSegmentStats(direction),
  ]);

  const statByIdx = new Map(stats.map((s) => [s.segmentIndex, s]));
  const segments: MapSegment[] = geo.map((g) => {
    const st = statByIdx.get(g.index);
    return {
      index: g.index,
      name: g.name,
      geometry: g.geometry,
      ratio: st?.ratio ?? null,
      avgSeconds: st?.avgSeconds ?? null,
      baselineSeconds: st?.baselineSeconds ?? null,
      samples: st?.samples ?? 0,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <Nav active="mapa" />

      <h1 className="text-2xl font-bold text-white sm:text-3xl">
        Mapa de gargalos
      </h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        Cada trecho é colorido pelo <strong>índice de congestionamento</strong> —
        quanto o tempo médio supera o fluxo livre (tempo mínimo já observado
        naquele trecho). Vermelho = onde o trânsito mais trava.
      </p>

      {/* Seletor de direção */}
      <div className="my-5 inline-flex rounded-lg border border-slate-700/60 bg-slate-900/50 p-1">
        {(Object.keys(LABEL) as Direction[]).map((d) => (
          <Link
            key={d}
            href={`/mapa?dir=${d}`}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              d === direction
                ? "bg-sky-500 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {LABEL[d]}
          </Link>
        ))}
      </div>

      <SegmentMap segments={segments} />

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        {[1.0, 1.3, 1.6, 2.0].map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-5 rounded"
              style={{ backgroundColor: ratioColor(r) }}
            />
            {ratioLabel(r)}
          </span>
        ))}
        <span className="text-slate-500">· clique num trecho para detalhes</span>
      </div>

      {/* Lista de trechos */}
      <section className="mt-8 space-y-2">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Trechos · {LABEL[direction]}
        </h2>
        {segments.map((s) => (
          <div
            key={s.index}
            className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3"
          >
            <span
              className="h-8 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: s.ratio != null ? ratioColor(s.ratio) : "#64748b",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-100">
                {s.index + 1}. {s.name}
              </div>
              <div className="text-xs text-slate-500">
                {s.ratio != null
                  ? `${ratioLabel(s.ratio)} · média ${fmtDuration(
                      s.avgSeconds
                    )} (livre ${fmtDuration(s.baselineSeconds)})`
                  : "Aguardando coletas"}
              </div>
            </div>
            {s.ratio != null && (
              <span className="shrink-0 font-mono text-sm font-semibold text-slate-200">
                {s.ratio.toFixed(2)}×
              </span>
            )}
          </div>
        ))}
      </section>

      <p className="mt-8 text-xs text-slate-500">
        Geometria da via: OpenStreetMap/OSRM · Tempos: Google Maps · As cores
        ganham confiabilidade conforme mais semanas de coleta acumulam.
      </p>
    </main>
  );
}
