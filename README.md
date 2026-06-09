# Trânsito SFS ↔ Joinville (BR-280)

Coleta de hora em hora o tempo de viagem entre **São Francisco do Sul** e
**Joinville** (ida e volta) direto do Google Maps, grava em PostgreSQL e expõe um
dashboard com os **melhores horários para viajar** numa via notoriamente
congestionada.

- **Trecho Referência (Sempre usado o mesmo):** Rua Fernandes Dias, Centro, São Francisco do Sul ⇄ Shopping Mueller Joinville — Centro
- **Janela:** Todos os dias de hora em hora (Timezone: America/Sao_Paulo)
- **Fonte:** Google Maps (scraping headless) — **sem API paga**

Além do tempo ponta-a-ponta, a rota é dividida em **5 sub-trechos** medidos
individualmente, alimentando um **mapa de gargalos** (`/mapa`) que mostra onde o
trânsito mais trava — comparando o tempo médio de cada trecho com seu fluxo
livre (mínimo histórico).

## Arquitetura

```
GitHub Actions (cron, grátis)
   └─ scraper/scrape.py  →  Playwright (Chromium headless)  →  Google Maps
                                      │
                                      ▼
                          PostgreSQL (Neon free tier)
                                      │
                                      ▼
                     web/  (Next.js na Vercel)  →  dashboard
```

| Camada | Tecnologia |
|---|---|
| Coletor | Python 3.11 + Playwright |
| Agendador | GitHub Actions (`.github/workflows/collect.yml`) |
| Banco | PostgreSQL (Neon) |
| Frontend | Next.js 15 (App Router) + Tailwind v4, deploy na Vercel |

## Estrutura

```
db/
  schema.sql      # tabela traffic_readings + índices
  seed.sql        # dados sintéticos p/ testar o dashboard
scraper/
  scrape.py          # coletor (Playwright → Postgres): total + sub-trechos
  config.py          # rotas (ida/volta) e fuso
  build_segments.py  # gera segments.json (OSRM + Nominatim) — rodar uma vez
  segments.json      # 5 sub-trechos: nome, coordenadas e geometria
  requirements.txt
web/              # app Next.js (dashboard de horários + mapa de gargalos)
  public/segments.json   # cópia da geometria para o mapa (Leaflet)
.github/workflows/collect.yml   # cron de coleta
```

---

## Setup

### 1. Banco (Neon)

1. Crie um projeto grátis em [neon.tech](https://neon.tech) e copie a connection
   string (`postgresql://user:pass@host/db?sslmode=require`).
2. O schema é aplicado **automaticamente** pelo coletor na primeira execução
   (`CREATE TABLE IF NOT EXISTS`). Para criar manualmente:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```
3. (Opcional) Popule dados de exemplo para ver o dashboard preenchido:
   ```bash
   psql "$DATABASE_URL" -f db/seed.sql
   ```

### 2. Coletor — teste local

```bash
cd scraper
pip install -r requirements.txt
python -m playwright install chromium

# valida só a extração, sem gravar no banco:
DRY_RUN=1 python scrape.py            # Windows PowerShell: $env:DRY_RUN=1; python scrape.py

# coleta de verdade:
export DATABASE_URL="postgresql://..."  # PowerShell: $env:DATABASE_URL="..."
python scrape.py
```

Em caso de falha na extração, screenshot + HTML da página são salvos em
`scraper/artifacts/` para depuração.

### 3. Agendamento (GitHub Actions)

1. Faça push do repositório para o GitHub (**repo público** = minutos de Actions
   ilimitados).
2. Em **Settings → Secrets and variables → Actions**, crie o secret
   `DATABASE_URL` com a string do Neon.
3. O workflow `collect.yml` é disparado **por um agendador externo** via
   `workflow_dispatch` (veja **[docs/AGENDAMENTO.md](docs/AGENDAMENTO.md)**).
   Para testar na hora: aba **Actions → Coleta de trânsito → Run workflow**.

> ⏰ **Não confie no `schedule` do GitHub para coleta horária.** O agendador
> interno é best-effort: atrasa e descarta runs em horários de pico, gerando
> buracos na série. Por isso o gatilho principal é externo (cron-job.org →
> API do GitHub). O `schedule` nativo fica só como fallback. Detalhes em
> [docs/AGENDAMENTO.md](docs/AGENDAMENTO.md).

### 4. Frontend (Vercel)

1. Importe o repositório na [Vercel](https://vercel.com) e defina **Root
   Directory = `web`**.
2. Adicione a variável de ambiente `DATABASE_URL` (mesma do Neon).
3. Deploy. O dashboard lê o banco em tempo real (`force-dynamic`).

Local:
```bash
cd web
npm install
echo "DATABASE_URL=postgresql://..." > .env.local
npm run dev
```

---

## Modelo de dados

Tabela `traffic_readings` — uma linha por leitura (direção × horário):

| coluna | descrição |
|---|---|
| `collected_at` / `collected_at_local` | instante UTC / horário de São Paulo |
| `local_date`, `local_hour`, `weekday` | recortes para agregação |
| `direction` | `ida` (SFS→Joinville) ou `volta` |
| `duration_seconds`, `duration_text` | tempo no trânsito |
| `distance_meters`, `distance_text`, `route_summary` | distância e via |
| `status`, `error` | `ok` / `failed` + motivo |

Um índice único impede gravar duas leituras `ok` da mesma direção na mesma
hora local.

## Limitações conhecidas

- **Scraping é frágil:** se o Google mudar o HTML do Maps, ajuste
  `ROUTE_BLOCK_RE` / a lógica de `extract_reading` em `scraper/scrape.py`. Os
  artifacts salvos em falhas ajudam.
- Quanto mais meses de dados acumulados, mais confiáveis as médias por horário.
