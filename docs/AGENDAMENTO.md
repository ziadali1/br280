# Agendamento confiável (gatilho externo)

## Por que não usar o `schedule` do GitHub

O evento `schedule` do GitHub Actions é **best-effort**: a
[própria documentação](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule)
avisa que runs agendadas podem ser **atrasadas em horários de pico** e, na
prática, são **silenciosamente descartadas** quando a fila está cheia. O minuto
`:00` (o mais óbvio para "de hora em hora") é justamente o pico. Repositórios
públicos/free têm prioridade ainda menor.

Resultado observado neste projeto: execuções espaçadas de forma quase aleatória
(gaps de 1h a 6h) em vez de hora em hora — buracos inaceitáveis para uma série
temporal de trânsito.

**Solução:** um agendador externo confiável dispara o workflow via API
(`workflow_dispatch`). O GitHub apenas *executa* (parte que funciona bem). O
`schedule` nativo fica só como fallback. Como o banco tem índice único por
`(direção, trecho, data, hora)`, disparos duplicados são inofensivos.

---

## 1. Criar um token (PAT fine-grained)

GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**

- **Resource owner:** sua conta (`ziadali1`)
- **Repository access:** *Only select repositories* → `br280`
- **Permissions → Repository permissions → Actions:** `Read and write`
  (o `Metadata: Read` é incluído automaticamente)
- Gere e **copie o token** (`github_pat_...`). Guarde com cuidado.

### Teste o token (opcional, recomendado)

```bash
curl -i -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/ziadali1/br280/actions/workflows/collect.yml/dispatches \
  -d '{"ref":"main"}'
```

Resposta esperada: **`HTTP/2 204`** (No Content). Em segundos a run aparece na
aba **Actions**.

---

## 2. Agendar no cron-job.org (grátis, dispara no minuto certo)

1. Crie conta em [cron-job.org](https://cron-job.org).
2. **Create cronjob** com:
   - **Title:** `BR-280 coleta`
   - **URL:** `https://api.github.com/repos/ziadali1/br280/actions/workflows/collect.yml/dispatches`
3. Em **Advanced / Request settings**:
   - **Request method:** `POST`
   - **Request body:** `{"ref":"main"}`
   - **Headers:**
     | Key | Value |
     |---|---|
     | `Accept` | `application/vnd.github+json` |
     | `Authorization` | `Bearer SEU_TOKEN_AQUI` |
     | `X-GitHub-Api-Version` | `2022-11-28` |
     | `Content-Type` | `application/json` |
4. Em **Schedule**:
   - **Timezone:** `America/Sao_Paulo`
   - **Hours:** `0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23`
   - **Minutes:** `0`
   - (Days of month / month / weekday: todos)
5. **Expected status code:** `204` (para o cron-job.org marcar como sucesso).
6. Salve.

Pronto: dispara hora em hora, no minuto cheio, no fuso de São Paulo, dentro da
janela 05h–00h.

---

## Alternativa: Cloudflare Worker (sem serviço de terceiros)

Se preferir não usar o cron-job.org, um **Cloudflare Worker** com Cron Trigger
(grátis, confiável) faz o mesmo POST. O PAT fica num secret do Worker
(`wrangler secret put GH_TOKEN`) em vez de num formulário web. Peça o código se
quiser seguir por aqui.
