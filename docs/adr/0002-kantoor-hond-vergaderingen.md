# ADR 0002 — Levend kantoor, vergaderingen en de hond

Datum: 2026-11-19 · Status: aangenomen

## Besluit

- **Loopwereld** in `packages/ui` als pure TypeScript (testbaar zonder browser): navgrid 20×14, meubels blokkeren cellen, 4-verbonden A* (geen hoeken afsnijden), vaste bureau- en vergaderstoelen, uitwijking (wachten → omrijden rond anderen → na 3 s langs elkaar schuiven, nooit door meubels). Rendering als zelfgemaakte SVG-isometrie in `apps/web/src/components/OfficeView.tsx`.
- **Gescheiden waarheid:** de backend bepaalt werkstatus, vergaderstatus en alarmen; de browser bepaalt alleen posities en frames. Een agent kan vergaderen terwijl zijn taak doorloopt (“taak loopt op achtergrond”).
- **Vergaderingen** zijn een workflow in de worker: unieke `(workspace_id, meeting_key)` en unieke `(schedule_id, planned_at)`; updates worden deterministisch uit opgeslagen taken/alarmen/freshness samengesteld (geen zes modelcalls); één begrensde synthese met `externalWritesAuthorized: false`. Na uitval alleen de laatste gemiste firing binnen 180 min, gelabeld “verlaat”. Het zichtbare venster (`endsAt`) is los van het verslag; overslaan/versnellen is puur lokaal.
- **Hond** = deterministische watchdog (`packages/domain/src/watchdog.ts` + `apps/worker/src/watchdog.ts`). Geen modelcall, geen succesclaim, geen retry, geen externe actie. Alarmen gededupliceerd per taak+toestand; herstel zet `recovered`. Visueel loopt de hond naar het snuffelpunt naast het bureau van de rol met het nieuwste alarm.

## Waarom zo

Testbaarheid (A* en simulatie headless getest), eerlijkheid (geen fictieve activiteit) en robuustheid (vergaderverslagen ook zonder geopende browser).

## Afwegingen

- 2D-SVG i.p.v. Three.js: conform bouwplan; 3D is een latere oplevering die dezelfde backendstatus leest.
- Simulatie draait per browser; twee kijkers zien niet exact dezelfde posities. Dat is acceptabel: posities zijn decoratief, status niet.
