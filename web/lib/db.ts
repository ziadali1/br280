import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;

export const hasDb = Boolean(url);

if (!hasDb) {
  console.warn("DATABASE_URL não definida — o dashboard mostrará estado vazio.");
}

// Só instancia o cliente quando há URL. Todas as queries checam `hasDb` antes
// de tocar em `sql`, então o cast nulo nunca é exercido sem banco.
export const sql = hasDb ? neon(url!) : (null as unknown as ReturnType<typeof neon>);
