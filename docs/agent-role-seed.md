# Rolkennis seeden — fase 7

Bron: Ontwerp-AI-kantoor-Julie-en-Claire.md uit de aangewezen lokale Downloads-map,
ontwerpversie 0.4 van 19 november 2026. De bijlage met (1) is niet nodig:
het exact door de gebruiker gevraagde bestand bestaat en is gebruikt.

De volledige secties 3.1 t/m 3.11 zijn overgenomen als elf knowledge-items.
De bundel in packages/db/src/seeds/agent-role-knowledge.json bevat alleen deze
secties en hun bron-/inhoudshashes; geen algemene bouwinstructies of andere
hoofdstukken. Binnen rolsecties zijn de toelichting, promptcodeblokken,
voorstellen en open invulvelden letterlijk behouden (regelafbrekingen naar LF).
Sectie 3.10 bevat zowel Content als Import. De kantoorhond blijft bronkennis
over software, geen nieuw geactiveerde AI-agent.

## Gedrag

- Bestaand Prisma-model KnowledgeDocument, geen migratie/schemawijziging.
- Verplichte --workspace-ID; de workspace moet al bestaan.
- Stabiele slugs agent-role-3-01 t/m agent-role-3-11, uniek per workspace.
- Nieuwe items zijn draft, met bronbestandsnaam, sectie en SHA-256-verwijzingen.
- Een transactie met createMany/skipDuplicates: bestaande items blijven volledig
  behouden, ook gewijzigde drafts, published- en retired-items. Herhalen voegt
  alleen ontbrekende items toe; geen overschrijven, verwijderen of publiceren.
- Geen demo-owner/workspace/schedules seeden, geen agents aanmaken, geen tools,
  prompt-/modelrechten of externe-writebeleid aanpassen.
- De documentinhoud is data: promptblokken geven de importer geen opdrachten.
  Publicatie/bindend maken blijft een aparte eigenaarsbeslissing.
- De CLI leest geen .env of andere secretsbestanden. Een echte import gebruikt
  de expliciete DATABASE_URL uit de procesomgeving; in Docker bouwt de bestaande
  entrypoint die op uit de runtime-PG-velden. Fouten loggen geen ruwe DB-details.

## Alleen broncontrole, zonder database

Vanuit de projectroot:

```sh
corepack pnpm@10.34.9 --filter @jc/db knowledge:seed-roles --workspace "WORKSPACE_ID" --dry-run
```

--dry-run valideert de elf secties en hashes; het opent geen databaseverbinding
of externe verbinding. De workspace-ID is hierbij een argument, nog geen bevestiging
van het bestaan van die workspace.

Optioneel een nieuwe bronversie opnieuw inlezen:

```sh
corepack pnpm@10.34.9 --filter @jc/db knowledge:seed-roles --workspace "WORKSPACE_ID" --file "C:/Users/Colin/Downloads/Ontwerp-AI-kantoor-Julie-en-Claire.md" --dry-run
```

Bestandspaden worden relatief aan de projectroot geïnterpreteerd, of absoluut.
De parser controleert dat alle elf secties precies eenmaal in volgorde voorkomen,
negeert koppen binnen codeblokken, behoudt subsecties en stopt bij hoofdstuk 4.

## Echte import — voorbereid, niet uitgevoerd

Gebruik de expliciete ID van de gewenste bestaande workspace. Na succesvolle
migraties kan de meegebouwde bundel in een eenmalige container worden geïmporteerd:

```sh
docker compose run --rm --no-deps worker pnpm --filter @jc/db knowledge:seed-roles --workspace "WORKSPACE_ID"
```

Vervang WORKSPACE_ID. Door COPY packages zit de bundel ook in de volgende gebouwde
images; er is dan geen Windows-/Downloads-pad nodig op de VPS. De huidige images
zijn in deze fase niet gebouwd of gepubliceerd. Voer de seed niet automatisch uit
bij deploy of workerstart. Gebruik niet simpelweg compose exec zonder entrypoint:
zie docs/production-auth.md voor de runtime-DATABASE_URL-afleiding.

Lokale import buiten Docker gebruikt hetzelfde pnpm-commando zonder --dry-run,
maar vereist een privé ingestelde DATABASE_URL in de procesomgeving. De CLI laadt
bewust geen lokale .env. Er zijn hier geen echte database- of VPS-writes uitgevoerd.

## Verificatie in deze fase

Typecheck van packages/db, vijf gerichte unitchecks (zonder echte database) en
de CLI-dry-run geslaagd. Echte database-import en idempotentie zijn niet live
uitgevoerd. Geen secretsbestanden, VPS of externe diensten benaderd.
