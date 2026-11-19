# Bedrijfscontext — uitgelezen via Codex (19 november 2026)

## Bevestigd eigenaarbesluit: cmva is de databron

Het bestaande dashboard `CMVAGroup/cmva` (Lovable + Supabase, live op cmva.nl)
wordt de **databron voor AI Office**. cmva blijft op Lovable; AI Office krijgt
later een eigen VPS en draait daar 24/7. Dit besluit vervangt de eerdere open
architectuurkeuze en de prioriteit voor eigen Shopify/Meta-imports.
Het bevestigt niet automatisch alle overige bedrijfsgegevens in dit document.

De koppeling leest uitsluitend `GET /api/public/ai/summary`. Route en inline
documenttypes `Day`, `Prod`, `Expense` zijn via GitHub alleen-lezen gecontroleerd
(blob `27492f218a3e07193a0db43d5ad8e6d9baf31149`). Geen cmva-wijzigingen gedaan.
Implementatie en beperkingen: `packages/connectors/src/cmva/README.md`.

**Open datapunten:** de bron levert EUR, terwijl de winkel AUD gebruikt in
Australia/Sydney. Er is geen vastgelegde wisselkoers: EUR wordt als EUR opgeslagen,
zonder conversie of optelling met AUD. DD-MM mist een jaar; voorlopig geldt de
laatste geldige datum op/vóór `generated_at` in Sydney binnen huidig/vorig jaar,
met vastgelegde aanname. Bronhistorie kan oudere jaren niet onderscheiden.
De bron sorteert op maand/dag vóór de limiet en kan daardoor rond januari dagen
weglaten. Een volledig jaartal en de betekenis/freshness van de cijfers moeten
nog met de eigenaar worden afgestemd; AI Office verandert de bron niet.

Bron: Codex-connectoren (Shopify, Google Drive, Klaviyo), **alleen lezen**, zonder klantgegevens. **Status: te verifiëren door de eigenaar.** Pas na bevestiging geldt dit als vaste kennis voor de agents.

## Bedrijf en winkel

| Gegeven | Waarde |
|---|---|
| Bedrijf | CMVA Commerce |
| Merk / winkel | Julie & Claire |
| Myshopify-domein | `skjbm4-9t.myshopify.com` |
| Publiek domein | julieandclaire.com |
| Shopify-abonnement | Advanced |
| Valuta | **AUD** |
| Tijdzone winkel | **Australia/Sydney** (Klaviyo: Australia/Melbourne) |
| Vestigingsland in Shopify | Nederland |
| Doelmarkt (afgeleid) | Australië |

**Gevolg voor de app:** de huidige standaardwaarden (EUR, Europe/Amsterdam) kloppen niet voor de winkel. Er moeten twee keuzes gemaakt worden:
- welke tijdzone een "rapportagedag" bepaalt;
- in welke tijdzone de vergadertijden gelden (eigenaar in NL, klanten in AU).

## Assortiment

- 1.313 producten: 1.310 actief, 3 niet vermeld en 0 concepten.
- Vendors: "Julie & Claire" (1.105) en "Mijn winkel" (208).
- Prijzen van AUD 28,00 tot AUD 194,95.
- Grootste producttypes:
  - jurken (onder meerdere namen: Dress, Women > Dress, Dresses, Sleeveless Midi Dresses, SALE DRESSES, Autumn Dresses);
  - Handmade Quilted Bag (84);
  - Sandals (77);
  - Bracelet (46);
  - Blouse (32).
- Datakwaliteit (werk voor de Product Lister):
  - bij 248 producten ontbreekt het producttype;
  - de taxonomiecategorie is bijna overal leeg;
  - dezelfde soort producten hebben verschillende typenamen.
- Bij de gecontroleerde producten staat voorraadtracking **uit**. "Voorraad 0" zegt dus niets over de beschikbaarheid. Dat past bij dropshipping.

## Fulfillment en locaties

- Locaties: "Torenlaan 5b" (eigen locatie) en "usadrop" (fulfillmentservice).
- Volgens het beleid: verwerking in 1–3 werkdagen en bezorging in gemiddeld 8–12 werkdagen; gratis verzending.

## Cijfers laatste 30 dagen (21 okt – 19 nov 2026, Sydney-tijd)

| Maatstaf | Waarde |
|---|---|
| Orders | 351 (operationeel) / 348 (Shopify-rapport). Het verschil is nog onverklaard |
| Omzet (`total_sales`) | AUD 26.338,63 |
| Gemiddelde orderwaarde | AUD 75,66 |
| Refundregistraties | 14, op 10 orders |
| Open orders / onverzonden orders (aangemaakt in de periode) | 10 / 9 |

## Geïnstalleerde Shopify-apps (relevant per rol)

| App | Relevant voor |
|---|---|
| POKY | Product Lister: import |
| CWILL (Parcel Panel), TrackBee Connect | Parcel Checker: tracking |
| Disputifier: Smart Chargebacks | Dispute Manager |
| USAdrop | Supply Chain: dropship-fulfillment |
| Klaviyo, SMSGo | Retention en e-mail |
| Microsoft Clarity | CRO |
| Messaging | CS (een aparte helpdesk is **niet** bevestigd) |
| Kaching Cart, Upsell.com, Kiwi Size Chart | Conversie en AOV |
| JDA, DASHBOARD 1, Shopify ChatGPT MCP App | Functie onbekend |

## Klaviyo

- Account "Julie & Claire" (ID `VrmqaB`), AUD, Australia/Melbourne.
- Conversiemetric: **Placed Order**, ID `Y2E72R` (Shopify-integratie).
- 9 flows staan live:
  - JC Welcome series;
  - JC Cart recovery (TrackBee);
  - JC Browse abandonment;
  - JC Browse recovery;
  - AB Site abandonment;
  - AB Abandoned cart;
  - AB Abandoned checkout;
  - AB Post purchase;
  - AB Shipping updates.
- 5 flows staan op draft, waaronder drie JC Shipping-flows.
- Campagnes van de laatste 30 dagen: Coastal main 20% (15 nov), Final Chance extra 25% (30 okt) en Click Frenzy extra 20% (28 okt).

## Google Drive

- **Profit sheet**: "MM 19 nov- Profit sheet", met tabbladen per maand. Daarin staan per dag de omzet, advertentiekosten, inkoop, transactie- en retourkosten, winst, ROAS en percentages. Dit is een logische bron voor **Finance**.
- **Productresearch**: sheets voor Canada en VK, met status, competitorlink, inkoop, verkoop en break-even-ROAS. Ze verwijzen naar andere winkels (Banffe, Clara & Iris, Lisa Peter London). Hoe die winkels met Julie & Claire samenhangen, is onbekend.
- **Geen importklare Poky-wachtrij gevonden** voor Julie & Claire. Zoeken op "Poky" en "CMVA" leverde niets op.
- Een CS-rapportagesjabloon (PDF, leeg) en algemene trainingsnotities. Er is geen ingevulde, bedrijfseigen CS-procedure gevonden.

## Bestaand eigen dashboard (GitHub, via Codex uitgelezen)

- **Repo:** `CMVAGroup/cmva` (privé, laatste push 18-11-2026). Oudere versie: `CMVAGroup/Dashboard` (Netlify, statisch).
- **Stack:**
  - TypeScript, React 19, TanStack Start;
  - Supabase (PostgreSQL, auth, realtime, opslag);
  - gebouwd met Lovable.
- **Live:** `cmva.lovable.app` / `cmva.nl`. Eigen ingest-backend: `api.cmva.nl`; die VPS-code staat niet in de zichtbare repo's.
- **Meerdere winkelprofielen:** Julie & Claire, Sofie Laurent, Aveline Boutique.
- **Bevat al:**
  - Shopify (Admin GraphQL, OAuth per winkel, ShopifyQL-omzet en sessies);
  - Meta (spend, creatives, uploads, budgetplanning);
  - attributie (UTM, pixel);
  - Clarity;
  - ParcelPanel-tracking;
  - Gmail-supportinbox met tickets, concepten, macro's en notities;
  - Google Sheets (productresearch, macro's);
  - Canva, Telegram en Slack;
  - een AI Copilot;
  - auto-decisions en eindedagrapporten;
  - profit per dag.
- **Ontbreekt:** Klaviyo en TrackBee.
- **Bevat ook externe schrijffuncties:** advertenties aanpassen en supportantwoorden versturen.
- **Lees-API voor andere apps:** `GET /api/public/ai/summary?store=<profiel>&days=30` met bearer-token (`AI_SUMMARY_TOKEN`).
  - Levert winkels, dagcijfers, totalen, producten en kosten.
  - Het zijn opgeslagen dashboarddocumenten, geen verse sync.
  - Bedragen zijn decimale **EUR**, datums staan als `DD-MM`.
  - Er is geen workspacefilter.

**Gevolg:** veel van wat AI Office in fase 2 en 3 zou bouwen (Shopify-, Meta-, Clarity- en tracking-sync, supportinbox, profit) bestaat al in cmva. Dubbel bouwen ligt dan niet voor de hand. Zie de keuze bij de open vragen.

## Aandachtspunten

1. **Het retourbeleid is inconsistent.** Er staan zowel 30 dagen als 14 dagen in, het verwijst naar "Aussies Finest Melbourne", en de terugbetaling van bezorgkosten is onduidelijk. Dit is belangrijk voor de CS- en Dispute-agents en verdient juridische controle.
2. **Dezelfde productsoort heeft verschillende typenamen**, en bij veel producten ontbreekt het type. Dat is een eerste klus voor de Product Lister.
3. **Er is geen helpdesk bevestigd.** Waar komen de klantmails binnen?
4. **Er draaien meerdere winkels of merken** (AB-flows, Banffe, Clara & Iris, Lisa Peter London, Aveline Boutique). Moet de app één winkel of meerdere bedienen?

## Open vragen voor de eigenaar

- Welke tijdzone voor rapportage en vergaderingen: Amsterdam (eigenaar) of Sydney (winkel)?
- Waar komen klantmails binnen: Shopify Messaging, Gmail of een andere tool?
- Welke Google Sheet is de importlijst voor Poky? Of moet die nog gemaakt worden?
- Is de profit sheet de officiële bron voor de financiële cijfers?
- Wat doen de apps JDA en DASHBOARD 1?
- Eén winkel (Julie & Claire) of meerdere winkels in de app?
- **Architectuurkeuze besloten:** cmva is de alleen-lezen databron; AI Office draait later afzonderlijk op een VPS, cmva blijft op Lovable.
