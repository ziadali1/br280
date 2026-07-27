import { Extremes as ExtremesData, ExtremeReading } from "@/lib/queries";
import { WEEKDAYS_FULL, fmtDuration, fmtHour } from "@/lib/format";

export function Extremes({ data }: { data: ExtremesData }) {
  if (!data.worst && !data.best) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card
        title="🔴 Pior já registrado"
        accent="text-rose-400"
        reading={data.worst}
      />
      <Card
        title="🟢 Melhor já registrado"
        accent="text-emerald-400"
        reading={data.best}
      />
    </div>
  );
}

function fmtDate(iso: string): string {
  // "2026-07-26" -> "26/07"
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

function Card({
  title,
  accent,
  reading,
}: {
  title: string;
  accent: string;
  reading: ExtremeReading | null;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <h4 className={`mb-2 text-sm font-semibold ${accent}`}>{title}</h4>
      {reading ? (
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-100">
              {WEEKDAYS_FULL[reading.weekday]}, {fmtHour(reading.hour)}
            </div>
            <div className="text-xs text-slate-500">em {fmtDate(reading.date)}</div>
          </div>
          <div className="text-2xl font-bold text-white">
            {fmtDuration(reading.seconds)}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Sem dados.</div>
      )}
    </div>
  );
}
