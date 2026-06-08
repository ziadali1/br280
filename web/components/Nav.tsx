import Link from "next/link";

export function Nav({ active }: { active: "home" | "mapa" }) {
  const item = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active === key
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mb-6 flex items-center gap-1 border-b border-slate-800 pb-3">
      <span className="mr-2 text-sm font-bold text-sky-400">BR-280</span>
      {item("/", "Horários", "home")}
      {item("/mapa", "Mapa de gargalos", "mapa")}
    </nav>
  );
}
