import { HeatCell } from "@/lib/queries";
import {
  WEEKDAYS,
  WINDOW_HOURS,
  fmtDuration,
  fmtHour,
  congestionColor,
} from "@/lib/format";

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const map = new Map<string, HeatCell>();
  for (const c of cells) map.set(`${c.weekday}-${c.hour}`, c);

  const values = cells.map((c) => c.avgSeconds);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  if (!cells.length) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-slate-400">
        Ainda sem dados suficientes para esta direção. O coletor roda de hora em
        hora — volte em breve.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-12" />
            {WINDOW_HOURS.map((h) => (
              <th key={h} className="px-1 pb-1 text-[11px] font-medium text-slate-400">
                {fmtHour(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((label, wd) => (
            <tr key={wd}>
              <td className="pr-2 text-right text-xs font-medium text-slate-400">
                {label}
              </td>
              {WINDOW_HOURS.map((h) => {
                const cell = map.get(`${wd}-${h}`);
                if (!cell) {
                  return (
                    <td
                      key={h}
                      className="h-9 w-12 rounded-md bg-slate-800/40"
                      title={`${label} ${fmtHour(h)} — sem dados`}
                    />
                  );
                }
                return (
                  <td
                    key={h}
                    className="h-9 w-12 rounded-md text-center align-middle text-[10px] font-semibold text-black/80"
                    style={{ backgroundColor: congestionColor(cell.avgSeconds, min, max) }}
                    title={`${label} ${fmtHour(h)} — média ${fmtDuration(
                      cell.avgSeconds
                    )} (${cell.samples} leituras)`}
                  >
                    {Math.round(cell.avgSeconds / 60)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <span>Mais rápido</span>
        <span className="inline-block h-3 w-24 rounded bg-gradient-to-r from-[hsl(140_68%_45%)] via-[hsl(70_68%_45%)] to-[hsl(0_68%_45%)]" />
        <span>Mais lento</span>
        <span className="ml-2 text-slate-500">· valores em minutos</span>
      </div>
    </div>
  );
}
