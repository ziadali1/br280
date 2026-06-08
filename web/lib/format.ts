export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Ordem de exibição da janela de coleta: 05h..23h e depois 00h.
export const WINDOW_HOURS = [...Array.from({ length: 19 }, (_, i) => i + 5), 0];

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}

export function fmtHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

/** Verde (rápido) -> vermelho (lento), proporcional ao valor entre min e max. */
export function congestionColor(value: number, min: number, max: number): string {
  if (max <= min) return "hsl(140 65% 42%)";
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const hue = 140 - ratio * 140; // 140=verde -> 0=vermelho
  return `hsl(${hue} 68% 45%)`;
}

/** Cor pelo índice de congestionamento (ratio = atual / fluxo livre). */
export function ratioColor(ratio: number): string {
  // 1.0 (livre) -> verde ; >=2.0 (dobro do tempo) -> vermelho
  const t = Math.min(1, Math.max(0, (ratio - 1) / 1));
  const hue = 140 - t * 140;
  return `hsl(${hue} 75% 48%)`;
}

export function ratioLabel(ratio: number): string {
  if (ratio < 1.15) return "Fluindo";
  if (ratio < 1.4) return "Moderado";
  if (ratio < 1.8) return "Lento";
  return "Congestionado";
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
