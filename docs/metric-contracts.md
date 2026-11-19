# Metriccontracten (versie 2026-11-19.1)

Implementatie: `packages/domain/src/metrics.ts`. Tests: `packages/domain/test/metrics.test.ts`. Elke berekening wordt als `metric_snapshots`-rij opgeslagen met formule, teller/noemer, filters, periode (halfopen UTC-interval), tijdzone, bronrecord-IDs, notities en contractversie.

## Gemeenschappelijk

- **Geld:** gehele minor units (eurocenten). Deling half-up afgerond (`divideMinorRound`). Ratio’s op 2 decimalen.
- **Periode:** lokale datums in de rapportagezone (standaard `Europe/Amsterdam`) → `[start, end)` in UTC. Zomertijd correct (25-/23-uursdagen getest).
- **Orderpopulatie:** orders aangemaakt in de periode, **niet** geannuleerd, **geen** testorder, valuta = winkelvaluta. Uitgesloten orders worden met reden vermeld.

## Metrics

| Key | Definitie | Noemer / bijzonderheden |
|---|---|---|
| `net_product_revenue` | Σ(aantal × stukprijs excl. btw) − Σ kortingen excl. btw − Σ productretouren excl. btw | Excl. btw en verzending. **Retouren op retourboekingsdatum** (`refunded_at` in periode), ook op oudere orders; retouren op test/geannuleerde/anders-valuta-orders tellen niet |
| `order_count` | Aantal orders in de orderpopulatie | |
| `aov` | `net_product_revenue` / `order_count` | Zelfde populatie; retouren op oudere orders verlagen de AOV van deze periode (wordt vermeld). 0 orders → onbekend |
| `meta_spend` | Σ spend op accountniveau per accountdag in de periode | Accountzone ≠ rapportagezone → `partial`; andere valuta → uitgesloten + `partial`; ontbrekende dagen → `partial` |
| `revenue_per_meta_spend` | `net_product_revenue` / `meta_spend` | Heet expliciet zo: **geen** volledige MER zolang alleen Meta gekoppeld is |
| `meta_roas` | Door Meta toegeschreven purchase value / Meta-spend | Onder opgeslagen attributie-instellingen; nooit optellen bij Klaviyo |
| `klaviyo_attributed_revenue` | Σ door Klaviyo toegeschreven omzet in de periode | Overlapt met Meta en winkelomzet; nooit optellen |
| `contribution_margin_after_ads` | Netto productomzet + netto verzendopbrengst − kostprijs − fulfillment − verzending − betaalfees − spend | **Altijd onbekend** zolang kosten ontbreken; noemt ontbrekende SKU’s en kostensoorten |
| `conversion_rate` | Orders / sessies uit gevalideerde bijpassende sessiebron | **Onbekend** in fase 1. Clarity-sessies zijn geen vervangende Shopify-noemer |

## Basislijn (ochtendbrief)

Voor omzet en Meta-spend: daggemiddelde over de 7 dagen vóór de periode (`<key>__baseline_7d`). Voor AOV en omzet/Meta-spend: dezelfde ratio over die 7 dagen. Afwijkingen ≥ 15% worden als **hypothese** (zekerheid laag) gemeld, nooit als oorzaak.

## Nog vast te leggen met de eigenaar

Zie `docs/open-questions.md`: behandeling van gedeeltelijke annuleringen, cadeaubonnen, verzendretouren, wisselkoersen, en aansluiting op Shopify-rapportage (fase 2).
