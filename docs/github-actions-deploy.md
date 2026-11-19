# GitHub Actions-deployment — fase 6

De workflow .github/workflows/deploy.yml draait bij pushes naar master. Hij bouwt
web en worker vanuit de monorepo-root, publiceert beide naar GHCR met latest en
de commit-SHA, en deployt pas als beide builds en pushes zijn geslaagd.

Images:
- ghcr.io/cmvagroup/jc-office-web
- ghcr.io/cmvagroup/jc-office-worker

Compose gebruikt deze images, inclusief de workerimage voor de migratieservice.
OFFICE_IMAGE_TAG is standaard latest; de workflow exporteert de concrete SHA
voor zowel pull als up. Er wordt tijdens de SSH-deployment niet op de VPS gebouwd.

## Eenmalige configuratie — hier niet uitgevoerd

Stel in de GitHub-repository deze Actions secrets in:
- SSH_KEY: private deploymentsleutel voor de VPS-gebruiker; nooit in git/chat/logs.
- SSH_HOST: 213.32.65.85.
- SSH_USER: ubuntu (toegang tot Docker zonder sudo).

Stel daarnaast de openbare Actions repositoryvariable SSH_KNOWN_HOSTS in met de
complete known_hosts-regel voor deze host, verkregen via een vertrouwd kanaal.
Dit is een publieke hostkey, geen extra secret. StrictHostKeyChecking staat aan;
de workflow gebruikt geen ongeverifieerde ssh-keyscan of uitgeschakelde controle.
De sleutel moet zonder interactieve passphrase werken op de runner en de
bijbehorende publieke deploymentsleutel moet op de server geautoriseerd zijn.

De ingebouwde GITHUB_TOKEN krijgt alleen in de buildjob packages:write voor GHCR.
Er is geen aparte push-PAT in de workflow nodig. De repository/organisatie moet
publiceren onder de twee genoemde pakketnamen toestaan.

Op de VPS moet /home/ubuntu/jc-office al bestaan en van ubuntu toegankelijk zijn.
De private .env moet daar al correct ingevuld zijn (zie docs/deploy-checklist.md).
De eerste installatie, owner-aanmaak, Hermes-modelpull en DNS/HTTPS-inrichting
blijven voorbereidingen volgens die checklist; de workflow is voor updates.

Als de GHCR-pakketten private zijn, moet ubuntu op de VPS al registry-leesrechten
hebben voordat docker compose pull kan werken. Regel dit eenmalig privé met een
read:packages-credential en docker login ghcr.io, zonder de credential in een
commandoargument of log te zetten. De workflow verstuurt de GITHUB_TOKEN niet
naar de VPS en verandert pakketvisibility niet. Publieke images vereisen geen
registrylogin op de VPS. Geen van deze instellingen is hier aangepast.

## Deploygedrag

De SSH-job kopieert uitsluitend docker-compose.yml, Caddyfile en scripts/backup.sh
naar de vaste servermap. Geen .env, database, modelbestanden of andere secrets
worden gekopieerd. Bestaande deployconfiguratie wordt bij toekomstige uitvoering
bijgewerkt; er zijn geen remote rm-, prune- of volume-verwijdercommando's.

Daarna voert hij uit, met OFFICE_IMAGE_TAG op de concrete commit:

    docker compose pull && docker compose up -d

De migratieservice gebruikt dezelfde nieuwe workerimage; web/worker wachten op
succesvolle migraties. Bestaande volumes blijven behouden. Incompatibele migraties
vragen een afzonderlijk gepland onderhoudsmoment; deze workflow voegt geen
back-up/herstel- of dataverwijderactie toe. De eerste Ollama-modelpull moet al
zijn gedaan; updates starten geen automatische nieuwe modeldownload.

Deployments worden geserialiseerd. Een lopende rollout wordt niet geannuleerd;
GitHub kan oudere wachtende runs door de nieuwste vervangen. De post-deploy ps
is een statussnapshot; er is geen volledige HTTPS-/applicatie-acceptatietest.
Tijdelijke SSH-bestanden worden alleen op de GitHub-runner opgeruimd.

## Lokale verificatie en grenzen

Compose-configuratie en alle drie shellblokken zijn lokaal statisch gecontroleerd;
de shellblokken zijn niet uitgevoerd. Volledige Actions-validatie volgt pas op GitHub.

Deze fase maakt alleen bestanden gereed. Geen push, registrylogin, imagebuild,
imagepush, SSH-sessie, externe call of VPS-actie uitgevoerd. Bestaande .env en
echte secrets zijn niet gelezen. De Actions-versies zijn gekozen zonder externe
lookup, overeenkomstig de instructie geen externe calls te doen.

Deze werkmap heeft nog steeds geen .git; er zijn geen branch/commit/push gemaakt.
De workflow start pas nadat de gebruiker de bestanden naar master pusht en de
vereiste GitHub-/VPS-configuratie heeft ingevuld.
