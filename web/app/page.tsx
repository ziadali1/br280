import Link from "next/link";
import {
  Direction,
  getCollectionHealth,
  getHeatmap,
  getHourStats,
  getOverview,
} from "@/lib/queries";
import { Heatmap } from "@/components/Heatmap";
import { BestHours } from "@/components/BestHours";
import { fmtDateTime } from "@/lib/format";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DIRECTIONS: Record<Direction, { label: string; from: string; to: string }> = {
  ida: {
    label: "Ida",
    from: "São Francisco do Sul",
    to: "Joinville",
  },
  volta: {
    label: "Volta",
    from: "Joinville",
    to: "São Francisco do Sul",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string }>;
}) {
  const params = await searchParams;
  const direction: Direction = params.dir === "volta" ? "volta" : "ida";
  const info = DIRECTIONS[direction];

  const [overview, heatmap, hourStats, health] = await Promise.all([
    getOverview(direction),
    getHeatmap(direction),
    getHourStats(direction),
    getCollectionHealth(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <Nav active="home" />
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-sky-400">
          BR-280 · Santa Catarina
        </p>
        <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">
          Trânsito São Francisco do Sul ↔ Joinville
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Tempo de viagem coletado de hora em hora no Google Maps, 24h por dia.
          Descubra os melhores horários para encarar essa via —
          notoriamente congestionada.
        </p>
      </header>

      {/* Seletor de direção */}
      <div className="mb-6 inline-flex rounded-lg border border-slate-700/60 bg-slate-900/50 p-1">
        {(Object.keys(DIRECTIONS) as Direction[]).map((d) => {
          const active = d === direction;
          return (
            <Link
              key={d}
              href={`/?dir=${d}`}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {DIRECTIONS[d].label}: {DIRECTIONS[d].from} → {DIRECTIONS[d].to}
            </Link>
          );
        })}
      </div>

      {/* Cartões de resumo */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Direção" value={`${info.from} → ${info.to}`} small />
        <Stat label="Leituras coletadas" value={overview.total.toLocaleString("pt-BR")} />
        <Stat label="Última leitura" value={overview.lastDurationText ?? "—"} />
        <Stat label="Atualizado em" value={fmtDateTime(overview.lastCollected)} small />
        <HealthStat filled={health.filledSlots} total={health.totalSlots} />
      </section>

      {/* Ranking de horários */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Melhores e piores horários
        </h2>
        <BestHours stats={hourStats} />
      </section>

      {/* Heatmap */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-white">
          Mapa de calor: dia da semana × hora
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Tempo médio de viagem ({info.from} → {info.to}). Quanto mais vermelho,
          mais lento.
        </p>
        <Heatmap cells={heatmap} />
      </section>

      {/* Metodologia */}
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-400">
        <h2 className="mb-2 text-base font-semibold text-slate-200">Metodologia</h2>
        <p>
          A cada hora, 24h por dia (horário de Brasília), um coletor
          automatizado consulta o tempo de viagem &ldquo;no trânsito&rdquo; no
          Google Maps para as duas direções entre{" "}
          <strong>Rua Fernandes Dias, 322 — Centro, São Francisco do Sul</strong>{" "}
          e <strong>Shopping Mueller Joinville — Centro</strong>. Cada medição é
          gravada em um banco PostgreSQL. As médias acima consolidam todas as
          coletas por faixa de horário. Quanto mais meses de dados, mais
          confiável a recomendação — o objetivo é servir tanto a quem viaja
          quanto a órgãos públicos de mobilidade.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Projeto de portfólio de engenharia de dados. Fonte: Google Maps · Sem
          API paga.
        </p>
      </section>
    </main>
  );
}

function HealthStat({ filled, total }: { filled: number; total: number }) {
  const pct = total ? filled / total : 0;
  // Verde >=70% (limiar do verify_health.py), âmbar >=40%, vermelho abaixo
  const color =
    pct >= 0.7 ? "text-emerald-400" : pct >= 0.4 ? "text-amber-400" : "text-rose-400";
  const dot =
    pct >= 0.7 ? "bg-emerald-400" : pct >= 0.4 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        Saúde da coleta
      </div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>
        {filled}/{total}
      </div>
      <div className="text-xs text-slate-500">últimas horas coletadas</div>
    </div>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 font-semibold text-white ${
          small ? "text-sm" : "text-2xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
