# ADR 0003 — Veiligheid, approvals en modeladapter

Datum: 2026-11-19 · Status: aangenomen

## Besluit

- **Rollen:** owner (alles incl. goedkeuren, instellingen, noodstop), operator (taken, voorstellen, demo’s), viewer (lezen). Matrix in `packages/policy`. Elke API-route via `withAuth`; rol en lidmaatschap worden per verzoek uit de database gelezen.
- **Sessies:** HMAC-ondertekende cookie (httpOnly, SameSite=Strict, 8 uur). Demologin alleen met `DEMO_MODE=true` en `NODE_ENV !== production`; demogebruikers worden buiten demomodus geweigerd. Productieauth is een backlogtaak — er zijn **geen** standaardcredentials.
- **Approvals:** `action_proposals` bevat provider, account, doelobject, operatie, exacte payload, preconditions, evidence, risico, expiry en een SHA-256-hash over de canonieke JSON van al die velden. Goedkeuren vereist owner, status `pending_approval`, niet verlopen, en dezelfde hash. Eén `approvals`-rij per voorstel (uniek) + voorwaardelijke statusupdate → dubbelklik geeft één beslissing. Fase 1: alleen lokale status; `executeApprovedAction` gooit altijd.
- **Modeladapter:** één contract (`ModelAdapter`). `MockModelAdapter` is standaard. `AnthropicModelAdapter` (officiële SDK, `messages.parse` + Zod-structured output, brondata in `<data>`-blok als niet-instructie) wordt alleen gekozen bij `MODEL_PROVIDER=anthropic` + `ALLOW_REAL_MODEL_RUNS=true` + key. Dagbudget (`MODEL_DAILY_BUDGET_USD`) wordt vóór elke run gecontroleerd; kosten per run in `agent_runs`. Max. 2 gelijktijdige runs (semaphore). Standaardmodel `claude-opus-5-5` (instelbaar via `MODEL_ALIAS`).
- **Validatie:** Zod-schema + bewijscontrole (iedere numerieke bewering moet naar een opgeslagen metricsnapshot met exact dezelfde waarde verwijzen; alle referenties moeten bestaan). Eén gerichte herstelpoging, daarna `failed` met leesbare reden.

## Bekende beperkingen

- De Anthropic-adapter is niet tegen de echte API getest (geen key; bewust). Server-side refusal-fallbacks zijn nog niet ingeschakeld — backlog.
- Geen CSRF-token naast SameSite=Strict; voldoende voor lokaal, herzien vóór productie.
