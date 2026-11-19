# CMVA leescontract

Eigenaarbesluit 19-11-2026: cmva blijft op Lovable/Supabase en is de databron;
AI Office krijgt later een eigen VPS-worker die 24/7 draait.

Alleen-lezen onderzocht via GitHub-connector:
`CMVAGroup/cmva/src/routes/api/public/ai/summary.ts`, blob
`27492f218a3e07193a0db43d5ad8e6d9baf31149`.
De documenttypes staan in dat bestand: `Day`, `Prod`, `Expense`.
De route leest `cmva.profit.days.v1`, `cmva.products.v2`, `cmva.expenses.v1`
en selecteert ook `cmva.profit.fixed.v1` (die laatste wordt niet teruggegeven).
Geen secrets of externe writes overgenomen.

`GET /api/public/ai/summary?store=<profile>&days=30`, Bearer-auth;
dagenbereik 1–120. Respons: `generated_at`, `stores[]` met `store`, `note`,
`totals`, `per_day`, `products`, `expenses`. Dit is een documentoverzicht,
geen bewijs dat Shopify/Meta vlak daarvoor zijn gesynchroniseerd.

Configuratie: `CMVA_API_BASE`, `CMVA_AI_SUMMARY_TOKEN`, `CMVA_STORE_PROFILE`.
Vul het echte profiel in (slug niet afgeleid van de winkelnaam).
Klik daarna als owner/operator in Instellingen op **CMVA synchroniseren**.
Dat bindt het profiel expliciet aan de huidige workspace en maakt het uurschema.
Er worden geen profielen automatisch over alle workspaces verspreid.
De worker doet de gevalideerde GET en slaat de dagmetrics op;
alleen een geslaagde echte call kan `connected` geven.
Losse `probe()` doet een GET met `days=1`.

Geld: gehele EUR-centen in `BIGINT`; geen EUR/AUD-conversie.
Orders: gehele aantallen (`unit=count`). ROAS: honderdsten (`ratio_hundredths`),
`null` bij onbekend; dit wordt nooit als geld opgeteld.
Bronversie, gegenereerd-/opgehaaldtijdstip, bronzone en jaaraanname blijven bewaard.
Producten/kosten/totalen worden gevalideerd, maar niet als dagcijfers opgeslagen.

Datums: laatste geldige DD-MM op of vóór `generated_at` in Australia/Sydney,
binnen huidig/vorig jaar. Aanname staat op iedere metric. Historische jaren
kunnen niet uit deze bron worden gereconstrueerd. De bron sorteert op MMDD vóór
de beperking tot N dagen: bij de jaargrens kan januari daardoor ontbreken.
AI Office kan ontbrekende brondata niet herstellen. Een jaarhoudende bronroute
en bevestiging van EUR versus winkelvaluta AUD blijven open punten.

De import staat apart van de bestaande Shopify-demometrics en ochtendbrief.
Een volgende stap is een expliciet cmva-rapportcontract met bewijslinks en
gedefinieerde metricbetekenissen; meng geen EUR-cijfers met AUD of demodata.

Fouten: auth, rate_limit (Retry-After), provider_outage, schema_change.
Geen providerbody of willekeurige exceptiontekst in status/logs; redirects uit.
Uurschema: UTC-uurgrenzen, maximaal de laatste gemiste run, geen nieuwe geplande
import zolang dezelfde workspace een actieve cmva_sync heeft.
