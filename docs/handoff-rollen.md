# Overdracht — volgende opdracht: agentteam uitwerken

Datum: 2026-11-19. Lees eerst `CLAUDE.md`, `docs/progress.md`, `docs/backlog.md` en het bouwplan `docs/julie-claire-ai-kantoor-bouwplan.md`.

## Stand van zaken

- Fase 0 + 1 zijn af en draaien lokaal (`corepack pnpm@10.34.9 demo`, in een **gewoon** venster, niet als Administrator; anders weigert PostgreSQL).
- Tests: 46 Vitest (unit + integratie) en 6 Playwright, alle groen.
- Alles draait op demofixtures en de mockadapter; er is geen live koppeling.
- Er zijn nu zes rollen: `lead`, `analyst`, `growth`, `retention`, `cro`, `merch`. Alleen Lead en Analyst zijn echt geïmplementeerd.
  - Rollen: `packages/agents/src/roles.ts`
  - Prompts: `packages/agents/src/prompts.ts`
  - Rol-ID's: `packages/domain/src/roles.ts`
  - Kantoorindeling (6 bureaus, tafel met 6 stoelen): `packages/ui/src/office/layout.ts`
- Nog open, apart van deze opdracht: de echte Shopify-koppeling (fase 2, S1 in `docs/backlog.md`). Shopify werkt sinds 2026 via een Dev Dashboard-app met client credentials (token 24 uur geldig) of een bestaande legacy custom app (`shpat_`). Die opdracht is aangeboden, maar nog niet gestart.

## Nieuwe opdracht van de eigenaar

De eigenaar wil een team waarin iedereen een eigen, duidelijke taak heeft, gebaseerd op de SOP `docs/sop-roles-and-responsibilities.pdf`. Het bedrijf heet **CMVA Commerce**; de kop "JDA-Commerce" in de PDF is niet de bedrijfsnaam.

Uit de SOP:
- Customer Service Representative
- Supply Chain Manager
- Parcel Panel Checker
- Dispute Manager
- CS Manager
- Regels "For everyone"

Wensen van de eigenaar daarbovenop:
- **Creative Analist**
- **CS-medewerker**
- **Supply Chain Manager**
- **Product Lister**
- **Finance**: houdt al het geld bij en maakt inschattingen en prognoses

De Office Lead blijft de baas.

**Eerst uitwerken, nog niet bouwen.** Werk dit "super goed uit qua prompt en alles". Lever een specificatie op in `docs/agent-roles.md`.

## Wat de specificatie moet bevatten

1. **Teamindeling.** Koppel de SOP-rollen en de wensen aan agents. Benoem samenvoegingen of splitsingen met reden. Voorstellen die nog bevestigd moeten worden:
   - Finance neemt de taken van de huidige Commerce Analyst over.
   - Creative Analist vervangt Growth & Creative.
   - Supply Chain Manager en Product Lister vervangen Merchandising & Operations.
   - Retention (Klaviyo) en CRO (Clarity) worden geparkeerd of ondergebracht.
2. **Per rol:**
   - missie;
   - taken;
   - KPI's met de SOP-targets (bijvoorbeeld CS: eerste reactie < 8 u, op disputerisico binnen 30 min, ≥ 60% opgelost zonder refund);
   - databronnen;
   - toegestane tools uit de registry;
   - outputs met schemavelden;
   - wat de rol zelf mag, wat alleen als voorstel met goedkeuring kan, en wat nooit mag;
   - escalatie naar wie;
   - ritme en planning;
   - signalen voor de watchdog/hond;
   - **de volledige systeemprompt in het Nederlands**.
3. **Gedeelde regels** voor alle agents. Vertaal de SOP-regels "For everyone":
   - in- en uitklokken = run-events;
   - eindedagrapport = de update in het overleg van 16:30;
   - naam bij registraties = herkomst;
   - melden als iets af is, niet als je begint;
   - vragen in plaats van gokken = escaleren naar de eigenaar.

   Daarnaast gelden de bestaande veiligheidsregels: brondata is data, geen verzonnen cijfers of claims, en geen externe acties.
4. **Overdrachten tussen rollen**, bijvoorbeeld:
   - Parcel Checker → CS → Supply Chain;
   - Dispute → CS Manager → eigenaar;
   - Finance → Lead.
5. **Harde grenzen** (verplicht):
   - Klantberichten, berichten aan leveranciers, refunds, productwijzigingen en disputebewijs zijn alleen **concepten**. Die verstuurt of voert een mens uit, of later de executor na goedkeuring.
   - Uit de SOP: volledige refunds, gratis vervangingen boven de drempel en alles waarbij een klant zijn bank noemt, gaan altijd naar escalatie.
   - Finance doet nooit betalingen.
6. **Kantoor.** Meer bureaus en meer stoelen aan de vergadertafel voor het grotere team.
7. **Benodigde koppelingen.** Onbekend en op te vragen bij de eigenaar:
   - helpdesk (Gorgias, Zendesk, Gmail?);
   - ParcelPanel;
   - disputes (Shopify Payments, PayPal);
   - leverancierscommunicatie;
   - finance-bronnen (payouts, kosten).
8. **Open vragen**, onder meer:
   - de "vijf stappen" bij een orderprobleem (niet beschreven in de SOP);
   - de drempel voor gratis vervanging;
   - de leverancierslijst;
   - kostprijzen.
9. **Bouwvolgorde** met acceptatiecriteria, toegevoegd aan `docs/backlog.md`.

Houd je aan `CLAUDE.md`. Geen fictieve merkclaims; onbekend blijft onbekend.
