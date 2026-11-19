De cmva-koppeling is gebouwd: client, Zod-contract, foutclassificatie, idempotente opslag, `cmva_sync`, uurschema en instellingenknop voor owner/operator. Documentatie is bijgewerkt.

- Alle typechecks en **43 unit-/contracttests slagen**.
- Database-integratietests, migratie-uitvoering en E2E zijn geprobeerd, maar geblokkeerd door lokale procesrechten (`EPERM`). De migratie is nog niet toegepast.
- Geen live cmva-call of externe wijziging gedaan.

Vul `CMVA_AI_SUMMARY_TOKEN` en `CMVA_STORE_PROFILE` in `.env` in en controleer `CMVA_API_BASE`. Pas daarna de migratie toe met draaiende database en klik op **CMVA synchroniseren**. De eerste klik stelt ook het uurschema in.

EUR/AUD en ontbrekende bronjaartallen blijven gedocumenteerde open punten; er vindt geen valutaomrekening plaats.