# Claude Code HTTP-wrapper — fase 9, 19 november 2026

- packages/claude-proxy: zelfstandige TypeScript/ESM HTTP-server met
  POST /v1/chat/completions, geordende tekstprompt en OpenAI-chatcompletion.
- claude -p <prompt> via execFile zonder shell; tools/MCP/hooks uit,
  geen user/project-settings of sessieopslag. Geen agenttoolrechten aangepast.
- Validatie, veilige fouten, 64 KiB invoer, 1 MiB uitvoer, 120 s timeout,
  maximaal één actieve call en annulering bij clientdisconnect.
- Compose: 127.0.0.1:11435, intern http://claude-proxy:11435 op frontend;
  eigen Dockerfile met CLI, non-root, healthcheck en geen hostmounts.
- .env.example: CLAUDE_PROXY_ENABLED=false en MODEL_PROVIDER=claude-proxy.
  CLI-auth niet ingericht. Worker heeft nog geen claude-proxy-adapter en valt
  voor deze provider terug op mock; vervolgintegratie buiten Phase 9 gehouden.
- Alle 73 unittests, 10 pakkettypechecks, native Node-runtime-smoke en
  Compose config --quiet met synthetische waarden geslaagd.
- Claude CLI/Docker-engine niet lokaal beschikbaar: echte modelcall,
  imagebuild/containerstart en live auth niet geverifieerd. Geen DB-/UI-wijziging;
  DB-/browserintegratietests niet uitgevoerd. Typecheck wijzigde gegenereerd
  apps/web/tsconfig.tsbuildinfo; buiten de commit gehouden.
- Alleen in de opgegeven projectmap gewerkt. Bestaande lokale wijzigingen
  behouden. Geen echte .env/loginbestanden gelezen, secrets, VPS-acties of deploy.
  Zie packages/claude-proxy/README.md. Gestopt na fase 9.

---

# Deploychecklist en owner-CLI — 19 november 2026

Lokale broncontrole uitgevoerd; geen echte .env gelezen of aangepast, geen
VPS-acties, externe calls, modelpulls, accountaanmaak of tests uitgevoerd.

- docs/production-auth.md: lokaal owner:create-commando klopt met package.json,
  src/create-owner.ts en provisionOwner. Docker-instructie gecorrigeerd naar
  docker compose run --rm --no-deps worker pnpm --filter @jc/db owner:create.
  Reden: exec krijgt de in het worker-hoofdproces opgebouwde DATABASE_URL niet mee;
  de eenmalige run doorloopt wel de entrypoint en raakt de worker-PID-file niet.
- docs/deploy-checklist.md toegevoegd met vier fases: privé server-.env aanmaken/
  invullen, containerstart plus Hermes-pull, owner-bootstrap en HTTPS-controle.
  Alle VPS-/netwerkcommando's zijn uitsluitend voorbereid en niet uitgevoerd.
- scripts/deploy.sh bevat nu de expliciete standaardopdracht
  docker exec ollama ollama pull hermes3 na containerstart en gereedheidscontrole;
  de instelbare modelvariant blijft ondersteund. Deployscript niet uitgevoerd.
- docs/deployment.md op dezelfde owner-aanmaakroute gebracht.
- Stop na punt/fase 4 van deze eigenaaropdracht; geen productieacties voortgezet.

---

# Ollama-ondersteuning — 19 november 2026

Eigenaaropdracht verwerkt: gedeeld @jc/ai-pakket toegevoegd met Ollama-adapter
naast mock en Anthropic. Bestaande @jc/agents-imports blijven compatibel via
re-exports; pnpm-lockfile bijgewerkt met bestaande dependencyversies.

- Ollama /api/chat met NDJSON-streaming, optionele token-callback/annulering,
  schemaoutput en begrensde Hermes 3 native tool-loop.
- Worker biedt alleen toegestane read-registrytools aan, via invokeTool en de
  bestaande rol-/workspace-/parametervalidatie; geen externe writes toegevoegd.
- MODEL_PROVIDER=ollama selecteert de lokale adapter; OLLAMA_MODEL standaard hermes3.
  Lokaal localhost:11434; Docker ollama:11434. UI toont Ollama als actieve provider.
- Compose: CPU-only ollama-service, intern 11434, vast ollama_models-volume.
- .env.example kiest Ollama/Hermes 3. Bestaande echte .env niet aangepast of getoond.
- Nieuw scripts/deploy.sh wacht op Ollama en haalt het gekozen model op vóór workerstart.
  Het script is voorbereid en niet uitgevoerd.
- Statische typechecks van ai, agents, worker en web geslaagd; shellsyntaxis geldig.
- Geen tests uitgevoerd (expliciete eigenaarinstructie). De eerdere testuitslagen
  hieronder gelden voor de voorafgaande versie, niet als Ollama-verificatie.
- Geen modelserver/modeldownload/modelcall gestart, geen VPS-acties of wijzigingen
  aan cmva/Shopify. Nog geen live bevestiging van Hermes 3 op deze CPU-omgeving.

Details: docs/deployment.md, sectie Ollama / Hermes 3.

---

# VPS-ingebruikname — fase 2, 19 november 2026

Deploypakket voorbereid in D:\CLAUDE\jc-office. Geen VPS-acties uitgevoerd.

- Dockerfiles voor web (next build/start op 3000) en worker (tsx), beide als node.
- Compose met PostgreSQL 17, eenmalige migraties, web, worker, Caddy en back-ups.
  Vier vaste volumes; databasepoort niet gepubliceerd. Migraties blokkeren appstart
  tot succes. Restartbeleid, healthchecks en logrotatie aanwezig.
- HTTPS-configuratie voor office.cmva.nl → web:3000; nog niet live gestart.
- .env.example volledig leeg met commentaar; alleen runtime-injectie van secrets.
  DATABASE_URL wordt veilig opgebouwd naar postgres:5432. Productie, DEMO_MODE=false
  en EXTERNAL_WRITES_ENABLED=false geforceerd. Modeldefault mock; budget 5 USD.
- Ignorebestanden per app plus effectieve Dockerfile.dockerignore-bestanden en
  rootfallback; .env/sleutels/databases/back-ups/work uitgesloten. Extra Next-tracefilters.
- Back-up direct na opstart, daarna dagelijks 03:00 UTC, 14 dagen retentie,
  herpoging na fouten, tijdelijke bestanden en cataloguscontrole.
- Officiële Compose- en Caddy-validatie geslaagd met synthetische waarden.
- Volledige Vitest-suite: 68/68 geslaagd. Alle acht typechecks en next build geslaagd.
- Back-upflow met testdoubles en shellsyntaxis gecontroleerd. Geen Docker-engine
  lokaal: echte imagebuilds, containerstart, dump/herstel en timer nog te verifiëren.
  Vier bestaande seed-lib-tracingwaarschuwingen blijven; context bevat geen secrets.

Gebruik en verificatiebeperkingen: docs/deployment.md. Volgende fase: Docker-build
op een Docker-host, daarna pas de geautoriseerde VPS-ingebruikname. Geen secrets
getoond, geen externe datawijzigingen. Deze map heeft nog steeds geen .git.
Stop na fase 2 zoals door de eigenaar gevraagd.

---

# VPS-ingebruikname — fase 1, 19 november 2026

Werkmap: D:\CLAUDE\jc-office. De bestaande map heeft geen .git; branch en commits
zijn daardoor niet mogelijk. Geen VPS-acties uitgevoerd. cmva en Shopify zijn
niet gewijzigd; geen live cmva-call uitgevoerd of secrets weergegeven.

## Lokaal testen en productie-login afgerond

- PostgreSQL gestart buiten de sandbox via node scripts/db.mjs --test,
  aparte cluster op loopbackpoort 54339. Testprocessen draaiden eveneens buiten
  de sandbox, met expliciete lokale DATABASE_URL naar deze cluster.
- Bestaande suite vóór wijzigingen: 58/58 geslaagd, inclusief vier cmva-tests.
- Na authwijzigingen: 64/64 Vitest-tests geslaagd: 43 unit/contract en 21
  echte PostgreSQL-integratietests, inclusief vier cmva-tests en zes auth-tests.
- Prisma-client gegenereerd; alle migraties inclusief password_login zijn
  door de integratie-setup op de aparte testdatabase toegepast.
- Typechecks voor web, worker, agents, connectors, db, domain, policy en ui geslaagd.
- Echte Next-productiebouw (next build) geslaagd. Vier tracingwaarschuwingen
  uit bestaande seed-lib.ts: dynamische kennisbestandpaden laten Next breed
  traceren. Bij het deploypakket expliciet uitsluiten dat .env/secrets in
  buildcontext, tracingoutput of images terechtkomen.
- Playwright is in deze fase niet uitgevoerd; de loginroute is wel rechtstreeks
  met echte PostgreSQL getest, inclusief cookie- en origincontroles.
- Nieuwe auth-tests bewijzen bcrypt, eenmalige owner-bootstrap, echte workspace,
  afwijzing van demo/onjuiste credentials, gelijktijdige/gedeelde rate limiting,
  verlopen buckets, globale limiet, origin/bodycontroles, HTTP 429, Secure/HttpOnly
  sessiecookie en blokkade van demologin bij NODE_ENV=production.

Loginprocedure en eenmalig CLI-commando: docs/production-auth.md.
De owner-CLI vraagt wachtwoorden verborgen; alleen synthetische testowners zijn
in deze sessie aangemaakt. APP_URL is nieuw en moet bij deployment worden ingesteld.
Er is nog geen echte productie-owner, live HTTPS of VPS-installatie.

Volgende fase: deploypakket met Docker/PostgreSQL/migraties/web/worker/Caddy en
back-ups. Stop na fase 1 zoals gevraagd door de eigenaar.

---

# Voortgangsstatus — 2026-11-19

## CMVA-koppeling — 19 november 2026

Eigenaarbesluit verwerkt: cmva (Lovable/Supabase) is de databron; AI Office krijgt
later een eigen 24/7 VPS. cmva is uitsluitend gelezen via de GitHub-connector.
De summary-route plus inline documenttypes zijn gecontroleerd op blob
`27492f218a3e07193a0db43d5ad8e6d9baf31149`; geen secrets overgenomen.

Toegevoegd: client + Zod-contract + auth/rate-limit/provider/schemafouten,
echte GET-probe, nieuwe Prisma-migratie voor idempotente dagmetrics per
workspace/profiel/datum/metric, bronvaluta EUR en gehele centen, fetched_at,
bronversie en jaaraanname. Orders zijn aantallen; ROAS honderdsten of onbekend.
cmva_sync draait zonder model. Instellingen toont de status en een knop voor
owner/operator; de eerste klik bindt het profiel en stelt het uurschema in.
Geplande runs halen alleen het laatste uur in en stapelen geen actieve syncs.

**Verificatie in deze sessie:**
- Prisma-client gegenereerd en Prisma-schema gevalideerd.
- Alle acht app-/codepakketten afzonderlijk getypecheckt: geslaagd.
- Alle 43 unit-/contracttests geslaagd (`npx vitest run --project unit --pool threads`).
  Standaard Vitest-forks en pnpm parallel typecheck botsen hier op spawn EPERM;
  threads en afzonderlijke tsc-commando's werken wel.
- Vier echte PostgreSQL-integratietests toegevoegd naast de bestaande elf.
  Uitvoering geprobeerd maar niet geslaagd: `node scripts/db.mjs` faalt met spawn
  EPERM; direct gestarte PostgreSQL breekt bij crashherstel af met
  `could not signal for checkpoint: Operation not permitted`.
- Geen live cmva-call, geen externe wijzigingen, geen token gelezen of gelogd.
- Deze aangeleverde werkmap heeft geen .git; eigen branch/commits niet mogelijk.
- Volledige Vitest-run geprobeerd (`--pool threads`), geblokkeerd door ontbrekende
  DB na de PostgreSQL-fout. Playwright geprobeerd: spawn EPERM, geen E2E/UI-validatie.
- `prisma migrate deploy` geprobeerd: schema-engine start geblokkeerd met spawn
  EPERM. De nieuwe migratie is dus voorbereid maar hier niet toegepast.

**Ingebruikname:** vul in .env CMVA_API_BASE, CMVA_AI_SUMMARY_TOKEN en het echte
CMVA_STORE_PROFILE in. Start de lokale DB vanuit een gewone shell, voer
`npx prisma migrate deploy` uit in packages/db, en klik als owner/operator op
CMVA synchroniseren in Instellingen met draaiende worker. Herhaal alle Vitest-
tests op de werkende DB. Lees `packages/connectors/src/cmva/README.md` voor het contract.

**Open:** EUR versus AUD zonder vastgelegde wisselkoers; jaartal ontbreekt in de
bron (vastgelegde latest-occurrence-aanname in Sydney). De bronsortering op MMDD
kan rond de jaargrens dagen weglaten. Import is apart opgeslagen; de bestaande
ochtendbrief is nog demo en gebruikt deze nieuwe cijfers nog niet.

## Opgeleverd

Fase 0 en fase 1 (verticale demo) zijn lokaal werkend opgeleverd op **demofixtures** en de **mockmodeladapter**.

## Bewezen met tests (laatste run 2026-11-19)

- Unit (35): metrics (korting, deelrefund op retourdatum, test/geannuleerd/andere valuta, daggrens, zomertijd, nul orders, onbekende marge/conversie), taaktransities, planning (op tijd, verlaat, geen stapel, weekend, zomertijd), watchdog (stagnatie, heartbeat, rate limit, wachten, dedup, herstel), schema/bewijs, rechten en approvalbinding, navgrid/A*, loopwereld (tafel bereiken zonder meubels, terugkeer, hond naar juist bureau, geen alarm-toestand zonder alarm, verminderde beweging).
- Integratie (11, echte PostgreSQL): ochtendbrief end-to-end met bewijs = snapshotwaarden; herstelpoging en leesbaar falen; één claim bij gelijktijdige workers; overname na crash + max. pogingen; annulering; drie vergaderingen = drie verslagen bij herhaalde ticks; alleen laatste gemiste vergadering “verlaat”; updates verwijzen naar echte taken; watchdog-alarm met echte oorzaak, dedup, herstel; geen alarm bij rate limit of leeg kantoor.
- E2E (6, Playwright/Edge tegen de draaiende demo): 401/403 per rol; workspace-afbakening (404 voor andere workspace); ochtendbriefroute in de UI met bewijslinks; vergadering zonder meubeldoorgang + verslag → taak; hond naar het juiste bureau en geen alarm bij rate limit; verminderde beweging + toetsenbord op bureau.
- Handmatig in de browser gecontroleerd: Kantoor, Vandaag, Resultaat, Taken, Vergaderingen, Goedkeuringen, Instellingen.

## Niet bewezen / bewust niet gedaan

- Shopify, Meta, Klaviyo en Clarity zijn nog interfaces + fixtures. CMVA is geïmplementeerd maar niet live geverifieerd.
- Anthropic-adapter niet live getest (geen key; bewust).
- Geen productie-auth, geen deployment.

## Eerstvolgende uitvoerbare taak

**CMVA-integratieverificatie en eerste echte leesproef**: zie `docs/backlog.md`.
Eigenaar zet CMVA_AI_SUMMARY_TOKEN en het winkelprofiel in .env, nooit in chat.
Eigen Shopify-sync is geparkeerd door het nieuwe databronbesluit.
