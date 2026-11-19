# ADR 0001 — Architectuur, stack en versies

Datum: 2026-11-19 · Status: aangenomen

## Besluit

TypeScript-monorepo (pnpm-workspaces) met Next.js voor web/API, een afzonderlijke Node-worker, PostgreSQL met Prisma, pg-boss als duurzame queue, Zod voor schema’s, Vitest en Playwright — conform bouwplan §7.

## Vastgepinde versies (gecontroleerd via de npm-registry op 2026-11-19)

| Pakket | Versie | Toelichting / afwijking |
|---|---|---|
| Node.js | ≥ 22.12 (getest 24.18) | pg-boss 12 vereist ≥ 22.12 |
| pnpm | 10.34.9 (Corepack) | Bewust niet 12.x (`latest`): 10.x is breed gebruikt en stabiel; upgrade is een backlogtaak |
| next | 16.4.6 | Turbopack; `params` en `cookies()` zijn async |
| react / react-dom | 19.3.1 | |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 | `latest`-tag wees naar 8.0.0-rc; bewust de laatste stabiele 7.x. Prisma 7 vereist een driver-adapter en `prisma.config.ts` |
| pg-boss | 12.38.2 | Concurrency via `localConcurrency`; dubbele jobs zijn onschadelijk door voorwaardelijke claim in de database |
| zod | 4.6.7 | |
| typescript | 6.0.3 | Bewust niet 7.x (native compiler zonder stabiele JS-API; risico voor Next-typecheck) |
| vitest | 4.1.12 | Bewust niet 5.x; 4.x is stabiel |
| @playwright/test | 1.65.1 | Draait met `channel: msedge` (geen browserdownload) |
| @anthropic-ai/sdk | 1.10.0 | `messages.parse` + `zodOutputFormat` |
| embedded-postgres | 17.11.0-beta.19 | PostgreSQL 17-binaries; “beta” is de naamgeving van dat pakket, niet van PostgreSQL. Alleen voor lokale dev/demo |

De lockfile `pnpm-lock.yaml` legt de volledige boom vast.

## Lokale database

Docker en PostgreSQL ontbraken op de ontwikkelmachine. `embedded-postgres` start echte PostgreSQL-binaries op loopback (`127.0.0.1`) met UTF-8 (`--encoding=UTF8 --locale=C`; anders kiest Windows WIN1252). Productie gebruikt beheerde PostgreSQL in een EU-regio (bouwplan §12).

## Taakmodel

- `tasks` is de bron van waarheid; pg-boss is alleen transport. Een dispatcher stuurt `queued` taken (en taken met verlopen lease) naar de queue.
- Claim = `SELECT … FOR UPDATE` + voorwaarde (`queued`, of `running` met verlopen lease) + lease. Dubbele jobs of meerdere workers kunnen daardoor niet dubbel uitvoeren.
- Pogingen tellen alleen bij eerste start en bij overname na een crash; na `maxAttempts` faalt de taak leesbaar (geen eindeloze retry).
- Transities gevalideerd in `packages/domain/src/tasks.ts`; elke transitie schrijft een event (`task_events`) dat via SSE naar de UI gaat.

## Gevolgen

- Geen Redis nodig. Eén worker volstaat voor de MVP; meerdere workers zijn veilig maar de modelsemaphore (max. 2) is per proces — bij meer workers moet die naar de database (backlog).
