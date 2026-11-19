# Deploypakket — fase 2

Doel: Ubuntu-VPS, alleen Docker/Compose; publieke URL na deployment:
https://office.cmva.nl. Er is in fase 2 niets op de VPS gestart of gewijzigd.

## Opbouw

- apps/web/Dockerfile: Node 24 Debian, pnpm 10.34.9, Prisma generate,
  next build en next start op 0.0.0.0:3000, als gebruiker node.
- apps/worker/Dockerfile: dezelfde basis; TypeScript via node --import tsx,
  als gebruiker node. Bevat ook Prisma CLI en owner:create.
- Compose: postgres, migrate, web, worker, ollama, caddy en backup. Database heeft
  alleen een intern netwerk en geen hostpoort. Alleen Caddy publiceert 80/443.
- migrate moet succesvol eindigen voordat web, worker en backup starten.
- PostgreSQL-data, dumps, Ollama-modellen, Caddy-certificaten en Caddy-config hebben vaste volumes.
- Web/worker herstarten na procesuitval en hostreboot (unless-stopped).
  Een unhealthy-status op zichzelf veroorzaakt geen Docker-herstart.
- Webhealth: /api/health controleert PostgreSQL en geeft alleen ok/unavailable.
  Workerhealth vereist de eigen actuele heartbeat; oude/andere workers tellen niet.
- Logs roteren met maximaal drie bestanden van 10 MiB per service.

Devdependencies blijven bewust in de images voor Next, tsx, migraties en owner-CLI.
Er wordt geen demoseed uitgevoerd. Productieschema's/kennis/CMVA-binding worden
in de vervolgfases ingericht; dit pakket maakt nog geen kantooractiviteiten aan.

## Secrets en veilige defaults

De buildcontext is altijd de monorepo-root (context: .). Beide appmappen hebben
.dockerignore én Dockerfile.dockerignore. Docker gebruikt bij deze buildcontext
het Dockerfile-specifieke bestand; de app-.dockerignore is de gelijkwaardige
kopie. Ook de root heeft een veilige fallback. Allowlist plus uitsluitingen
houden .env, sleutels, lokale databases, dumps, node_modules, caches en work buiten
de buildcontext. Productiesecrets zijn nooit build-args en zitten niet in images.
Next-tracing sluit daarnaast gevoelige bestandsnamen expliciet uit.

.env.example bevat de niet-geheime keuze MODEL_PROVIDER=ollama en OLLAMA_MODEL=hermes3; secrets blijven leeg. Alleen POSTGRES_PASSWORD
en SESSION_SECRET zijn verplicht voor Compose. SESSION_SECRET moet willekeurig
zijn, minimaal 32 tekens en geen change-me-waarde. Bewaar de echte .env uitsluitend
op de server met chmod 600. Zet dollarhoudende waarden in enkele quotes om
Compose-interpolatie binnen .env te voorkomen. Gebruik geen echte secrets in git,
commandoargumenten, logs of chat. Alleen benodigde variabelen worden per service
doorgegeven; de complete .env wordt niet gemount of met env_file geïnjecteerd.

Compose en de entrypoint forceren NODE_ENV=production, DEMO_MODE=false en
EXTERNAL_WRITES_ENABLED=false. Zonder providerinstelling blijft de fallback mock;
de env-template kiest nu Ollama. Anthropic-runs blijven standaard uit; dagbudget 5 USD. De Anthropic-key gaat alleen naar de worker.
APP_URL is vast https://office.cmva.nl.

DATABASE_URL in .env blijft voor Docker leeg. De entrypoint bouwt de URL tijdens
opstart uit POSTGRES_USER, POSTGRES_PASSWORD en POSTGRES_DB (standaardgebruiker
office, standaarddatabase jc_office) en encodeert het wachtwoord als URL-component.
Het doel is altijd postgres:5432, ook als een andere DATABASE_URL is opgegeven.
PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE zijn interne afgeleide containervariabelen.
Deze configuratie voorkomt onveilige stringinterpolatie van wachtwoorden in URLs.

## Voorbereide commando's voor fase 3 — hier niet uitgevoerd

DNS A moet naar 213.32.65.85 wijzen; eventueel AAAA moet ook correct zijn.
Controleer vooraf bestaande listeners en Docker-resources; verwijder niets zonder
expliciete toestemming. Caddy kan HTTPS pas verkrijgen wanneer DNS en 80/443 kloppen.

Maak uitsluitend bij ontbreken een server-.env, vul de verplichte velden privé in
en zet de rechten op 600. De cmva-token, het echte winkelprofiel en de Anthropic-key
blijven leeg tot de eigenaar die invult.

    docker compose config --quiet
    sh scripts/deploy.sh

Gebruik config altijd met --quiet; de uitgeschreven configuratie kan secrets tonen.
Aanvullende controle vóór starten:

    docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

Eenmalig, na succesvolle migraties, interactief:

    docker compose run --rm --no-deps worker pnpm --filter @jc/db owner:create --email <email> --name <naam>

Wachtwoord wordt tweemaal verborgen gevraagd. Zie docs/production-auth.md.

Voor updates: nieuwe broncode plaatsen, images bouwen, een verse back-up maken,
web/worker stoppen, migraties uitvoeren en services weer starten. Een migratie mag
niet stilzwijgend tegelijk met actieve oude code een incompatibel schema wijzigen.
Concreet stappenplan wordt bij de echte deployment vastgelegd; geen volumes wissen.

## Dagelijkse back-up

De backup-container gebruikt de PostgreSQL 17-client. scripts/backup.sh maakt
meteen bij opstart een custom-format dump, daarna dagelijks om 03:00 UTC
(BACKUP_UTC_HOUR, 0..23). Bij fouten wordt na 15 minuten opnieuw geprobeerd.
Alleen een geslaagde pg_dump plus leesbare pg_restore-catalogus wordt als .dump
gepubliceerd; gedeeltelijke bestanden worden verwijderd. Daarna worden alleen
eigen office-*.dump-bestanden ouder dan 14 dagen opgeruimd. Andere bestanden
blijven staan. Bestanden krijgen via umask 077 beperkte rechten; de map mode 700.

    docker compose exec backup /bin/sh /scripts/backup.sh
    docker compose exec backup ls -l /backups

Het vaste volume postgres_backups staat op dezelfde VPS; offsitekopieën zijn
nog niet ingericht. Back-uphealth wordt ongezond als er 26 uur geen verse dump is.
De huidige archiefcontrole is geen volledige herstelproef. Een echte herstelproef
naar een afzonderlijke database moet na de eerste containerdump plaatsvinden.
Herstel naar de actieve database kan gegevens overschrijven en wordt pas na
expliciete toestemming uitgevoerd; er zijn hier geen herstel-/wisacties gedaan.


## Ollama / Hermes 3 — aanvulling

De gedeelde adapters staan in packages/ai (@jc/ai). Bestaande imports via
@jc/agents blijven werken. MODEL_PROVIDER ondersteunt mock, anthropic en ollama.
OLLAMA_MODEL is standaard hermes3. Buiten Docker is OLLAMA_BASE_URL standaard
http://localhost:11434; Compose gebruikt http://ollama:11434 voor de worker.
Ollama vereist geen Anthropic-key of ALLOW_REAL_MODEL_RUNS=true. De bestaande
budget-/schema-/evidencecontroles en externe-writeblokkade blijven gelden.

OllamaModelAdapter.generate gebruikt standaard NDJSON-streaming; optioneel
stream:false voor één respons, onToken voor tekstchunks en signal voor annulering.
Tekstchunks zijn nog geen gevalideerd resultaat: alleen de definitieve output mag
na de bestaande schema-/bewijscontrole worden gebruikt. De aanvraag heeft een
5-minutentime-out, een totale output-tokenlimiet, maximaal vijf modelrondes en
acht tool-aanroepen. Native tool_calls worden verwerkt en met tool_name teruggestuurd.
Worker-analyses bieden uitsluitend read-tools uit de bestaande registry aan;
invokeTool controleert rol, parameters en workspace. Vergadersynthese krijgt geen
nieuwe tools. Er worden geen willekeurige HTTP-, SQL- of shelltools toegevoegd.
De adapter registreert werkelijke tokenaantallen en 0 USD aan providerkosten;
dit bedrag vertegenwoordigt geen meting van VPS-/stroomkosten.

Compose maakt de CPU-only service ollama (containernaam ollama) met vast volume
ollama_models. Er zijn geen GPU-reserveringen/devices en geen gepubliceerde
11434-poort. Vulkan/CUDA staan uit; aanvragen sturen bovendien num_gpu:0.
Het deployscript start postgres en ollama, wacht maximaal 5 minuten op ollama list,
en voert dan standaard docker exec ollama ollama pull hermes3 uit. Bij een andere
OLLAMA_MODEL wordt die modelnaam opgehaald. Pas daarna start het alle services.
Een modelpull is netwerkverkeer naar de Ollama-modelregistry, geen cmva-write.

Deze aanvulling is alleen statisch getypecheckt (ai, agents, worker en web) en
op shell-/Compose-syntaxis gecontroleerd. Op expliciet verzoek geen tests,
geen Docker-start, geen modeldownload, geen modelcall en geen VPS-actie uitgevoerd.
De eerdere 68/68 testuitslag hieronder is van vóór deze aanvulling.

API-/deployreferenties: https://docs.ollama.com/api/chat,
https://docs.ollama.com/capabilities/tool-calling,
https://docs.ollama.com/docker en https://ollama.com/library/hermes3.

## Verificatie fase 2 (vóór Ollama-aanvulling)

- Officiële Compose-validator (v5.8.0) en Caddy-validator (v2.11.9): configuratie geldig.
  Tools zijn alleen tijdelijk in work/tools gezet; officiële checksums gecontroleerd.
- Config gecontroleerd met synthetische waarden en --env-file .env.example;
  geen echte .env uitgelezen of uitgeschreven door de validatie.
- 68/68 Vitest-tests, inclusief vier cmva-tests en vier nieuwe productieconfig-/healthtests.
- Alle acht pakketten getypecheckt; echte Next-productiebouw geslaagd.
- Shell-/Node-syntaxis geldig. Back-upflow met testdoubles gecontroleerd op
  retentie, archiefcontrole, foutstatus en behoud van eerdere dumps bij fouten.
- Geen Docker-engine op deze Windows-machine: Linux-imagebuilds, containerstart,
  dagelijkse timer en echte pg_dump/pg_restore nog niet in Docker geverifieerd.
  De lokale embedded PostgreSQL-bundel bevat geen pg_dump/pg_restore.
- De vier bestaande Next-tracingwaarschuwingen uit seed-lib.ts blijven zichtbaar;
  de build slaagt, en uitsluitingen voorkomen gevoelige bestanden in de context.
- Geen VPS-acties, geen live cmva-call en geen wijzigingen aan cmva of Shopify.

Bronnen voor de configuratiekeuzes:
- https://docs.docker.com/build/concepts/context/
- https://docs.docker.com/compose/how-tos/startup-order/
- https://caddyserver.com/docs/automatic-https
