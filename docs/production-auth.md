# Productie-authenticatie

Fase 1 van de VPS-ingebruikname, 19 november 2026.

## Eenmalig owner-account

Voer eerst de Prisma-migraties uit op de eigen AI Office-database. Gebruik geen demoseed voor productie.

Vanuit de projectroot, in een interactieve terminal:

    corepack pnpm@10.34.9 --filter @jc/db owner:create --email "jouw-email" --name "jouw-naam"

Voor Docker op de VPS, na geslaagde migraties, gebruik in een interactieve terminal:

    docker compose run --rm --no-deps worker pnpm --filter @jc/db owner:create --email "jouw-email" --name "jouw-naam"

Vervang de twee voorbeeldwaarden door je eigen gegevens. Laat --no-TTY/-T en
invoerredirects weg: de wachtwoordprompt vereist een terminal. Deze eenmalige
container voert alleen de CLI uit en wordt na afloop opgeruimd; volumes blijven.
De entrypoint bouwt eerst DATABASE_URL uit de runtime-PG-velden. Gebruik niet
simpelweg docker compose exec worker pnpm ...: exec erft die door het hoofdproces
opgebouwde DATABASE_URL niet. Met run krijgt de CLI de juiste configuratie en
blijft het PID-bestand van de normale worker ongemoeid.

Het lokale corepack-commando hierboven klopt met packages/db/package.json
(owner:create → tsx src/create-owner.ts) en de CLI-opties in src/create-owner.ts.
Volledige start-/env-/HTTPS-volgorde: docs/deploy-checklist.md.

Optioneel: --workspace <workspacenaam>. Quote waarden met spaties.
Het commando vraagt het wachtwoord tweemaal verborgen. Minimaal 12 tekens, maximaal
72 UTF-8 bytes. Geen wachtwoord in argumenten, shellhistorie of chat zetten.
De CLI maakt in één transactie een echte workspace, gebruiker en owner-lidmaatschap.
Een database-lock voorkomt twee gelijktijdige bootstraps. Zodra een productie-owner
bestaat, weigert de CLI een volgende bootstrap; hij wijzigt geen bestaand account.
De CLI is geen wachtwoordreset- of extra-gebruikerscommando.

## Webconfiguratie

Alleen via de serveromgeving / server-.env:

- NODE_ENV=production
- DEMO_MODE=false
- APP_URL=https://office.cmva.nl
- SESSION_SECRET: willekeurige geheime waarde van minimaal 32 tekens
- DATABASE_URL: lokale uitvoering vereist een eigen URL; in Docker opgebouwd door de entrypoint naar postgres:5432

De huidige Compose-configuratie fixeert NODE_ENV, DEMO_MODE en APP_URL en injecteert
SESSION_SECRET. De server-.env bevat de PostgreSQL-velden; DATABASE_URL blijft
daar voor Docker leeg. Er is nog geen VPS-deploy uitgevoerd.
Demologin en demosessies zijn in productie altijd geblokkeerd, ook als iemand
DEMO_MODE per ongeluk op true zet. Open /login en gebruik e-mailadres en wachtwoord.

Wachtwoorden worden alleen als gesalte bcrypt-hash met cost 12 opgeslagen
(bcryptjs, bcrypt-algoritme). Sessies verlopen na acht uur en gebruiken een
HttpOnly / SameSite=Strict-cookie, met Secure in productie. Elk verzoek leest
workspace-lidmaatschap en actuele rol opnieuw uit de database.

Login accepteert alleen formulieren van APP_URL en maximaal 8 KiB formulierdata.
Onjuist wachtwoord en onbekend account krijgen dezelfde melding. Storingen geven
een algemene fout zonder database- of credentialdetails.

PostgreSQL telt pogingen atomair: maximaal vijf per genormaliseerd e-mailadres
per vast kwartier en maximaal 300 voor de hele app per kwartier. Limieten gelden
ook na een webherstart of over meerdere webprocessen. Accountlimieten kunnen
bewust door derden worden opgebruikt; dit is een afweging van de eerste versie.
HTTP 429 geeft Retry-After: 900. De limiettabel bevat gehashte buckets, geen ruwe
credentials; verlopen buckets worden bij volgende pogingen opgeruimd.

Een echt owner-account is lokaal nog niet aangemaakt. De integratietests maken
alleen synthetische accounts in de aparte, verwijderbare testdatabase.
