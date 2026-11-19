# Gefaseerde backlog met acceptatiecriteria

## Agentrolkennis — fase 7

- [x] Secties 3.1 t/m 3.11 als meeleverbare, gehashte bronbundel en workspacegebonden draft-seed voorbereid.
- [x] Typecheck, vijf lokale unitchecks en databasevrije dry-run geslaagd.
- [ ] Seed expliciet uitvoeren in de gekozen bestaande workspace en items door eigenaar laten beoordelen.
- [ ] Echte PostgreSQL-import en idempotentie verifiëren; geen nieuwe rollen/toolrechten automatisch activeren.

## Nieuwe prioriteit — cmva als databron (eigenaarbesluit 19-11-2026)

- [x] CMVA-client, Zod-responscontract, veilige foutclassificatie en echte GET-probe.
- [x] Migratie + workspace-/profielgebonden idempotente dagmetric-upserts, EUR-centen,
  bronversie, fetched_at, bronzone, jaaraanname; orders/ratio afzonderlijke units.
- [x] cmva_sync zonder modelcall, handmatige owner/operator-knop en verbindingsstatus.
  Eerste handmatige sync bindt het profiel aan de workspace en maakt het uurschema.
- [x] Contract-/unittests: 43 totaal geslaagd met `--pool threads`.
- [x] Nieuwe en bestaande database-integratietests uitgevoerd buiten de sandbox op
  lokale PostgreSQL via scripts/db.mjs --test: volledige suite 64/64 geslaagd.
  Vier cmva-integratietests toegevoegd: dubbele import, workspace-isolatie,
  veilige foutstatus/demolabel, uurschema en worker zonder model/netwerk bij lege token.
- [ ] Eigenaar vult CMVA_AI_SUMMARY_TOKEN en echt CMVA_STORE_PROFILE in .env in,
  controleert CMVA_API_BASE, past migraties toe en start een handmatige sync.
- [ ] Eerste live proef: alleen `connected` na geslaagde echte call; geen live API
  aangeroepen tijdens implementatie. Controleer aansluiting met dashboardrapport.
- [ ] EUR/AUD-betekenis en jaartal bevestigen; geen FX-conversie zonder vastgelegde koers.
  Bron sorteert DD-MM op MMDD: jaargrens kan januari uit geselecteerde dagen drukken.
- [ ] Cmva-cijfers ontsluiten in agentrapporten met bewijslinks en eigen metriccontract;
  bestaande ochtendbrief gebruikt voorlopig expliciete demometrics.
- [x] Productie-auth en Docker-deploypakket voorbereid (fase 1/2); zie docs/deployment.md.
- [ ] Linux-imagebuilds/containerstart en echte dump/herstelproef op Docker-host verifiëren.
- [ ] VPS-deployment met worker 24/7, serversecrets en live HTTPS/monitoring.

**Eerstvolgend:** lokale integratieverificatie en live cmva-leesproef na configuratie.
Onderstaande eigen Shopify-/Meta-/Clarity-connectors zijn geparkeerde alternatieven;
bouw ze niet dubbel zolang cmva de vereiste data kan leveren. Klaviyo ontbreekt in cmva.

Fasen volgen bouwplan §10. ✅ = opgeleverd in deze sessie (zie `docs/progress.md`).

## Fase 0 — Contracten ✅
- ✅ Architectuurbesluiten (`docs/adr/`), metriccontracten, open vragen, kennissjablonen (`onbekend`).
- ✅ Demo start zonder secrets.

## Fase 1 — Verticale demo ✅ (op fixtures + mockmodel)
- ✅ Monorepo, DB, migraties, queue, scheduler, watchdog, auth, Lead/Analyst, levend kantoor, schermen, tests.
- Restpunten fase 1 (klein):
  - [ ] **F1-R1 Modelsemaphore over workers heen** — nu per proces (max. 2). *AC:* twee workers samen nooit > 2 actieve `agent_runs` (DB-advisory-lock of telling in transactie); test met 2 workers.
  - [ ] **F1-R2 Refusal-fallback in Anthropic-adapter** — `stop_reason: refusal` wordt nu als fout behandeld. *AC:* server-side fallback (beta `server-side-fallback-2026-07-01`) ingeschakeld en getest met een echte key in een aparte, expliciet geconfigureerde proef.
  - [ ] **F1-R3 Live proef Anthropic-adapter** — *AC:* met eigen key, `ALLOW_REAL_MODEL_RUNS=true` en budget 1 USD: één ochtendbrief schema-geldig, kosten geregistreerd in `agent_runs`; budgetstop getest.
  - [ ] **F1-R4 Taak per agent toewijzen vanuit bureau-paneel** (nu: alleen ochtendbrief + demo’s). *AC:* alleen geïmplementeerde rollen; operator/owner; viewer 403.
  - [ ] **F1-R5 Kennisbeheer-UI** (draft → published door owner; feedback als wijzigingsvoorstel). *AC:* alleen owner publiceert; agents lezen alleen `published` als bindend.
  - [ ] **F1-R6 pnpm 10 → 11/12 en TypeScript 7-evaluatie.**

## Fase 2 — Shopify (geparkeerd: cmva heeft voorrang)

**S1 Shopify-connector (lezen) — alleen indien cmva aantoonbaar tekortschiet**
- Invoer nodig: `.myshopify.com`-domein + custom app met `read_orders`, `read_products`, `read_inventory`, evt. `read_locations`; token via `.env`/secretmanager (`SHOPIFY_ADMIN_TOKEN`, nooit in DB/prompt/log).
- Bouw in `packages/connectors/src/shopify/`: Admin GraphQL-client met vastgepinde, bij start geverifieerde API-versie (plan noemt `2026-10`); cursorpaginatie; foutclassificatie (auth/permission/rate limit met `Retry-After`/throttle-status/provider/schema).
- `probe()` doet een echte `shop { … }`-query; alleen bij succes `connected`, anders `action_required` met reden.
- Eerste import: max. 60 dagen orders + refunds + producten/varianten + voorraad per locatie; `sync_runs` + `sync_cursors` (watermark `updated_at`); idempotente upserts op `(workspace, provider, external_id)`; `is_demo=false`; bronversie vastleggen.
- Worker-taaktype `shopify_sync` (geen modelcall) + schema (bijv. elk uur) + handmatige knop (operator/owner).
- *AC:* (1) contracttests met opgenomen fixtures: paginatie, 401/403, 429 met Retry-After, onverwacht veld, hervatten vanaf watermark; (2) testorder, deelrefund, korting en geannuleerde order correct in metrics; (3) twee keer dezelfde import = geen dubbele records; (4) dagtotaal netto productomzet verklaarbaar aangesloten op een Shopify-rapport (verschillen gedocumenteerd); (5) UI toont ‘verbonden’ alleen na geslaagde probe.

**S2 Shopify-webhooks** — raw-body HMAC-verificatie, `webhook_receipts` (uniek per provider/account/event-ID), snelle 200 + asynchrone verwerking, actuele toestand herlezen bij out-of-order events. *AC:* ongeldige HMAC 401; dubbele levering één keer verwerkt; andere volgorde → juiste eindtoestand.

**S3 Nachtelijke reconciliatie** — *AC:* gemiste webhook wordt ’s nachts hersteld; verschilrapport opgeslagen.

**S4 Ochtendbrief uit echte Shopify-data** — fixtures uit voor Shopify; Meta blijft demo (gelabeld). *AC:* aansluitverschillen gerapporteerd vóór andere kanalen.

## Fase 3 — Kanalen
- **M1 Meta (ads_read)**: Insights op account/campagne/adset/ad; valuta, accountzone, attribution window, action report time, grain opslaan; async reports; 3-uurlijkse run + nachtelijke 7-dagen-refresh. *AC:* één echte sync + één gecontroleerde foutproef; tijdzoneverschil zichtbaar.
- **K1 Klaviyo (Reporting API)**: revision-header pinnen; echte conversion metric-ID; endpointbudget (1/s burst, 2/min, 225/dag voor Campaign Values — bij implementatie verifiëren); rapport-POST als leesoperatie. *AC:* idem.
- **C1 Clarity Data Export**: ≤10 requests/dag, 1–3 dagen, ≤3 dimensies, 1.000 rijen (bij implementatie verifiëren); truncatiesignaal; gaten tonen. *AC:* geen optelling van overlappende snapshots (test).
- Kanaalschermen Growth / Retention / CRO & assortiment.

## Fase 4 — Zes rollen
- Prompts + outputschema’s voor Growth, Retention, CRO, Merch; Lead maakt hoogstens 3 deeltaken + 1 synthese; evaluatiepakket ≥ 20 opdrachten (verzonnen cijfers, bronloze conclusies, promptinjectie uit reviews/productteksten). *AC:* elke numerieke finding verwijst naar bewijs; geen live schrijfpad.

## Fase 5 — Productie-MVP
- Productie-auth (OIDC/SSO), CSRF, rate limits, secretmanager, EU-hosting, back-ups + herstelproef, monitoring (syncvertraging, queueleeftijd, kosten), 7 dagen proefdraaien. *AC:* zie bouwplan §10.

## Fase 6 — Beperkte writer
- Eén operatie (bijv. Meta-adset pauzeren of extern Klaviyo-draft) via aparte executor met eigen credentials, payloadbinding, expiry, statecheck, `unknown`-uitkomst, dubbele-approvaltest. *AC:* zie bouwplan §8 en §10.

## Later
- Three.js-kantoor (3–7 dagen) op dezelfde backendstatus; uitgebreidere sprites.
