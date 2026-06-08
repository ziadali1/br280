import { HourStat } from "@/lib/queries";
import { fmtDuration, fmtHour } from "@/lib/format";

export function BestHours({ stats }: { stats: HourStat[] }) {
  if (!stats.length) return null;

  const sorted = [...stats].sort((a, b) => a.avgSeconds - b.avgSeconds);
  const best = sorted.slice(0, 3);
  const worst = sorted.slice(-3).reverse();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel title="🟢 Melhores horários" accent="text-emerald-400" rows={best} />
      <Panel title="🔴 Piores horários" accent="text-rose-400" rows={worst} />
    </div>
  );
}

function Panel({
  title,
  accent,
  rows,
}: {
  title: string;
  accent: string;
  rows: HourStat[];
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <h4 className={`mb-3 text-sm font-semibold ${accent}`}>{title}</h4>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.hour} className="flex items-center justify-between text-sm">
            <span className="font-mono text-slate-300">{fmtHour(r.hour)}</span>
            <span className="font-semibold text-slate-100">
              {fmtDuration(r.avgSeconds)}
            </span>
            <span className="text-xs text-slate-500">{r.samples} leituras</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
