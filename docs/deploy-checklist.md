# Deploychecklist — voorbereide commando's, niet uitgevoerd

Deze checklist hoort bij de huidige code. Alle commando's hieronder zijn voor
latere handmatige uitvoering; tijdens het opstellen zijn geen VPS-acties,
modelpulls, HTTPS-verzoeken of andere externe calls uitgevoerd.

Aannames: de projectbestanden staan op de VPS in /home/ubuntu/jc-office;
Docker en Docker Compose zijn beschikbaar voor ubuntu. Kies de echte projectmap
als de code elders staat. Er is geen sudo nodig. Als rechten, Docker of poorten
blokkeren: stop, meld het concrete probleem en verwijder niets.

## Fase 1 — server-.env invullen

Open later zelf een interactieve SSH-sessie en ga naar de projectroot:

```sh
ssh ubuntu@213.32.65.85
cd /home/ubuntu/jc-office
```

Controleer eerst de plaatsing. Maak .env alleen als die ontbreekt; overschrijf
geen bestaande configuratie. Toon de inhoud niet en gebruik geen shell tracing.

```sh
test -f docker-compose.yml && test -f .env.example
umask 077
if [ ! -e .env ]; then cp .env.example .env; fi
chmod 600 .env
```

Genereer uitsluitend nog lege/ontbrekende POSTGRES_PASSWORD en SESSION_SECRET.
Deze Docker-opdracht schrijft de willekeurige waarden rechtstreeks naar .env,
zonder ze te printen of als commandoargument door te geven. Bestaande waarden
blijven behouden. De code hieronder wordt pas bij handmatige uitvoering gebruikt.

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD,target=/config" \
  --workdir /config node:24-bookworm-slim node --input-type=module -e '
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
let text = readFileSync(".env", "utf8");
for (const key of ["POSTGRES_PASSWORD", "SESSION_SECRET"]) {
  const line = new RegExp("^" + key + "=([^\\r\\n]*)$", "m");
  const match = text.match(line);
  if (match && !["", "\"\"", "\u0027\u0027"].includes(match[1].trim())) continue;
  const entry = key + "=" + randomBytes(32).toString("hex");
  text = match ? text.replace(line, () => entry) : text + "\n" + entry + "\n";
}
writeFileSync(".env", text, { mode: 0o600 });
chmodSync(".env", 0o600);
'
```

Vul daarna privé de niet-geheime instellingen en eventueel de CMVA-credentials
in de editor in. Zet geen secrets op de commandoregel, in chat of in logs.
Als vi ontbreekt: gebruik een beschikbare editor; installeer niets met sudo.

```sh
vi .env
chmod 600 .env
```

Werk in deze volgorde:

| Volgorde | Variabelen | Waarde / behandeling |
|---|---|---|
| 1 | POSTGRES_USER, POSTGRES_DB | office en jc_office; kies deze vóór de eerste initialisatie. |
| 2 | POSTGRES_PASSWORD | Door bovenstaande opdracht gegenereerd; niet tonen of opnieuw genereren bij een bestaande database. |
| 3 | SESSION_SECRET | Door bovenstaande opdracht gegenereerd; minimaal 32 willekeurige tekens. |
| 4 | MODEL_PROVIDER, OLLAMA_MODEL | ollama en hermes3. |
| 5 | ALLOW_REAL_MODEL_RUNS, ANTHROPIC_API_KEY | false en leeg; Ollama heeft geen Anthropic-key nodig. |
| 6 | MODEL_DAILY_BUDGET_USD, MODEL_MAX_CONCURRENT_RUNS | 5 en 2. |
| 7 | CMVA_API_BASE | https://cmva.nl. |
| 8 | CMVA_STORE_PROFILE, CMVA_AI_SUMMARY_TOKEN | Exact profiel en token privé invullen zodra beschikbaar; anders beide leeg laten. |
| 9 | WATCHDOG_INTERVAL_SECONDS, SCHEDULER_TICK_SECONDS, MEETING_VISUAL_SECONDS | 15, 20 en 45, of leeg voor dezelfde defaults. |
| 10 | BACKUP_UTC_HOUR | 3 (dagelijks 03:00 UTC), of leeg voor dezelfde default. |

Laat DATABASE_URL en OLLAMA_BASE_URL leeg in de server-.env. De entrypoint bouwt
DATABASE_URL naar postgres:5432; Compose fixeert het modeladres op
http://ollama:11434. APP_URL wordt door Compose op https://office.cmva.nl gezet.
NODE_ENV, DEMO_MODE en EXTERNAL_WRITES_ENABLED worden geforceerd op production,
false en false. Deze .env-velden kun je leeg laten; wijzigen activeert geen writes.
Laat MODEL_ALIAS voor Ollama leeg. MODEL_MAX_TOKENS_PER_RUN, WEB_PORT, PG_PORT,
TEST_DATABASE_URL, REPORTING_TIMEZONE en SHOP_CURRENCY blijven hier leeg; ze
stellen de productie-workspace of de huidige Ollama-worker niet in.

Controleer zonder uitgeschreven configuratie (die zou secrets kunnen tonen):

```sh
docker compose config --quiet
```

## Fase 2 — containers starten en Hermes 3 ophalen

DNS voor office.cmva.nl moet naar 213.32.65.85 wijzen. Een eventuele AAAA-record
moet ook de juiste VPS bereiken. Controleer de bezetting van poorten 80/443 en
bestaande containers; stop bij conflicten en vraag toestemming vóór verwijderen.

```sh
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Gebruik één van de onderstaande twee routes; ze hebben dezelfde startvolgorde.

Aanbevolen, met het voorbereide script:

```sh
sh scripts/deploy.sh
```

Of voer de huidige scriptstappen handmatig uit voor het standaardmodel hermes3:

```sh
set -e
docker compose build web worker
docker compose up -d postgres ollama
attempt=0
until docker exec ollama ollama list >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'Ollama werd niet binnen 5 minuten gereed.' >&2
    exit 1
  fi
  sleep 5
done
docker exec ollama ollama pull hermes3
docker exec ollama ollama list
docker compose up -d
docker compose ps --all
```

Stop bij een mislukte build, modelpull of start; ga dan niet door naar owner-aanmaak.
Het script doet dat automatisch door set -eu. Plak het handmatige blok alleen in
een shell met foutstop (set -e) of voer elke opdracht pas uit na een geslaagde vorige.
De pull gebruikt extern netwerkverkeer en wordt hier alleen gedocumenteerd.
Poort 11434 is niet naar de host gepubliceerd; gebruik docker exec voor Ollama.
Modellen blijven in het vaste ollama_models-volume bewaard.

De migratieservice moet eindigen met exitcode 0. Web en worker wachten daarop;
Caddy wacht op de webhealthcheck. Controleer na de start zonder ruwe logs/secrets:

```sh
docker compose ps --all
docker compose exec -T web node -e \
  'fetch("http://127.0.0.1:3000/api/health", {signal: AbortSignal.timeout(10000)}).then(async r => { console.log(r.status); console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => { console.error("Healthcontrole mislukt"); process.exit(1); })'
```

Verwacht bij webhealth HTTP 200 met {"status":"ok"}. In ps --all moeten postgres,
ollama, web en worker healthy zijn; migrate staat op Exited (0). Backup krijgt
na de eerste voltooide dump een healthy-status. Caddy draait als proxy.
Dit controleert nog geen succesvolle Hermes-generatie of CMVA-import.

## Fase 3 — eenmalig owner-account na de eerste start

Broncontrole: packages/db/package.json definieert owner:create als
`tsx src/create-owner.ts`. Deze CLI accepteert --email, --name en optioneel
--workspace, en maakt via provisionOwner een workspace plus owner-lidmaatschap.
Het wachtwoord wordt tweemaal verborgen gevraagd (minimaal 12 tekens, maximaal
72 UTF-8 bytes). Bestaande productie-owners worden nooit overschreven.

Voer vanuit dezelfde interactieve SSH-sessie uit:

```sh
printf 'E-mailadres eigenaar: '
IFS= read -r OWNER_EMAIL
printf 'Naam eigenaar: '
IFS= read -r OWNER_NAME
docker compose run --rm --no-deps worker \
  pnpm --filter @jc/db owner:create \
  --email "$OWNER_EMAIL" --name "$OWNER_NAME"
unset OWNER_EMAIL OWNER_NAME
```

Gebruik hier geen -T, --no-TTY, pipe of invoerredirect: de verborgen
wachtwoordinvoer vereist een terminal. Het commando start een tijdelijke
CLI-container, geen tweede queue-worker, en ruimt die na afloop op via --rm.
De bestaande database en modelvolumes blijven staan. De command-entrypoint
bouwt DATABASE_URL uit de runtime-PG-velden voordat de CLI begint.

Gebruik hiervoor niet `docker compose exec worker pnpm ...`: een nieuw
exec-proces erft niet de DATABASE_URL die de entrypoint alleen binnen het
lopende workerproces heeft opgebouwd. De run-route gebruikt wel de entrypoint
en beïnvloedt het PID-bestand/de health van de normale worker niet.

Na de melding Productie-owner aangemaakt kun je inloggen op
https://office.cmva.nl/login. Deel het wachtwoord niet en maak geen demoseed aan.
Een tweede bootstrap weigert zodra er al een productie-owner bestaat.

## Fase 4 — HTTPS en toegang controleren

Onderstaande curl-opdrachten zijn externe calls voor latere handmatige uitvoering.
Ze zijn bij het maken van deze checklist niet uitgevoerd. Gebruik geen -k:
certificaatketen en hostnaam moeten normaal gevalideerd worden.

```sh
curl --fail --silent --show-error --max-time 30 \
  --output /dev/null --write-out 'HTTPS-login: %{http_code}\n' \
  https://office.cmva.nl/login

curl --fail --silent --show-error --max-time 30 \
  https://office.cmva.nl/api/health

curl --silent --show-error --max-time 30 --output /dev/null \
  --write-out 'HTTP-redirect: %{http_code} -> %{redirect_url}\n' \
  http://office.cmva.nl/login
```

Verwacht: HTTPS-login 200, health {"status":"ok"}, en HTTP-redirect 308 naar
https://office.cmva.nl/login. Bij certificaat-/DNS-/connectiefouten: stop en los
die op; omzeil TLS-validatie niet. Caddy kan bij de eerste start even nodig hebben
om het certificaat te verkrijgen. Verifieer vervolgens zelf in de browser de
owner-login en dat de modelweergave Ollama noemt.

Stop na deze fase. Activeer geen Anthropic-runs, verander geen cmva/Shopify-data,
en verwijder geen bestaande VPS-bestanden, containers of volumes zonder toestemming.
