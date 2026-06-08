import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trânsito SFS ↔ Joinville | Melhores horários na BR-280",
  description:
    "Dados horários de tempo de viagem entre São Francisco do Sul e Joinville (BR-280), coletados do Google Maps. Descubra os melhores horários para viajar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="text-slate-100 antialiased">{children}</body>
    </html>
  );
}
