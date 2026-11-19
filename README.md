# Julie & Claire AI Office — verticale demo (fase 0 + 1)

Interne e-commerceapp met een levend, klikbaar isometrisch agentenkantoor: zes geanimeerde agents (Office Lead = baas), één kantoorhond (watchdog), teamvergaderingen, dashboards, duurzame taken, bewijsgebonden resultaten en gecontroleerde goedkeuringen.

> **Status:** lokale demo. Alle brondata is **demofixture** (“demo/niet gekoppeld”), het taalmodel is de **mockadapter**, externe writes zijn **hard uitgeschakeld**. Zie [docs/progress.md](docs/progress.md) en [docs/backlog.md](docs/backlog.md).

## Vereisten (Windows)

- Node.js ≥ 22.12 (getest met 24.18)
- pnpm 10 via Corepack (meegeleverd met Node): `corepack pnpm@10.34.9 --version`
- **Geen** Docker of eigen PostgreSQL nodig: de demo start een lokale PostgreSQL 17 via `embedded-postgres` (echte PostgreSQL-binaries uit npm) op `127.0.0.1:54329`. Eigen PostgreSQL gebruiken? Zet `DATABASE_URL` in `.env` en start met `node scripts/demo.mjs --external-db`.
- Microsoft Edge (voor de Playwright-tests; standaard aanwezig op Windows).
- Gebruik een **kort projectpad** (bijv. `D:\CLAUDE\jc-office`). Te lange paden (>±200 tekens) breken procesopstart op Windows.

## Starten (PowerShell)

```powershell
corepack pnpm@10.34.9 install
```

```powershell
corepack pnpm@10.34.9 demo
```

Open daarna http://127.0.0.1:3210 en kies een demogebruiker (eigenaar, operator of kijker). `pnpm demo` doet: `.env` aanmaken uit `.env.example` (indien nodig) → database starten → migraties → Prisma-client → seed → worker + web. Stoppen met Ctrl+C.

> Werkt `pnpm install` niet met de fout `readStream must be readable`? Draai het via `cmd /c "corepack pnpm@10.34.9 install"` (bekend probleem met pnpm-lifecycle-scripts in sommige niet-interactieve shells).

## Tests

```powershell
corepack pnpm@10.34.9 test:unit
```

```powershell
corepack pnpm@10.34.9 test:integration
```

```powershell
corepack pnpm@10.34.9 test:e2e
```

Integratietests vereisen een draaiende database (`pnpm db:start` of `pnpm demo`) en gebruiken een aparte database `jc_office_test`. De e2e-tests draaien tegen de lopende demo (of starten hem zelf).

## Wat werkt

| Onderdeel | Status |
|---|---|
| Kantoor (hoofdscherm) | SVG-isometrie, 6 lopende agents + hond, A*-navgrid, meubelobstakels, vaste stoelen, uitwijking; klik op bureau → rol/taken/tools/grenzen; activiteitenpaneel; verminderde beweging |
| Vergaderingen | 09:00/13:00/16:30 werkdagen (instelbaar), duurzame scheduler met unieke firing, één inhaalrun (“verlaat”), demoknop; updates uit echte taken; één begrensde synthese van de baas; verslag + evidence |
| Hond / watchdog | deterministisch, elke 15 s (instelbaar): heartbeat, voortgang, deadline, wachtrij, mislukking; onderscheidt rate limit, wachten op eigenaar/deeltaak; dedup + herstelstatus |
| Ochtendbrief | queue → Lead → deeltaak Analyst → metricsnapshots + evidence → Lead-synthese → schema- en bewijsvalidatie → opgeslagen artefact |
| Vandaag / Taken / Resultaat / Goedkeuringen / Instellingen | werkend op echte backenddata |
| Auth | owner/operator/viewer, workspace-afbakening, demologin alleen met `DEMO_MODE=true` buiten productie |
| Koppelingen | interfaces + fixtures; status ‘demo/niet gekoppeld’; **geen** live API-proef |
| Model | mockadapter actief; Anthropic-adapter aanwezig maar achter schakelaar + key + budget, **niet live getest** |

## Structuur

```text
apps/web/            Next.js 16 (pagina’s, API, auth, SSE)
apps/worker/         pg-boss-consumer, dispatcher, scheduler, watchdog, vergaderingen
packages/domain/     metriccontracten, tijdzones, taakstatussen, planning, watchdog, schema’s
packages/db/         Prisma 7-schema, migraties, taakrepository, seed
packages/connectors/ connectorcontract + demofixtures
packages/agents/     rollen, toolregistry, mock- en Anthropic-adapter, gevalideerde runs
packages/policy/     rechten, approvalbinding, executorpoort (fase 1: altijd uit)
packages/ui/         loopwereld-engine (navgrid, A*, simulatie, iso-projectie)
knowledge/julie-claire/  kennissjablonen (alles ‘onbekend’, status draft)
docs/                ADR’s, metriccontracten, open vragen, backlog, voortgang
tests/               integratie (Vitest + PostgreSQL) en e2e (Playwright)
```
