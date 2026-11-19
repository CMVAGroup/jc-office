# Open vragen en onbekende bedrijfsgegevens

Alles hieronder is **onbekend** en wordt in de app niet door aannames vervangen.

## Bedrijf en merk
- Webshopdomein (`*.myshopify.com`), productcategorie, assortiment, landen en talen.
- Merkstem, doelgroep, merkkleuren, goedgekeurd productbewijs/claims.
- Verzend-, retour- en klantbeleid.
- Marges, kostprijzen per SKU, fulfillment-, verzend- en betaalkosten.
- Campagnekalender en eerdere experimenten.

## Configuratie
- Winkelvaluta (demo gaat uit van EUR — gemarkeerd als “nog te bevestigen”).
- Accounttijdzones van Shopify, Meta en Klaviyo.
- Rapportagezone bevestigen (standaard Europe/Amsterdam).
- Freshnessgrenzen (voorstel: Shopify 2 u, Meta 6 u, Klaviyo 24 u, Clarity 36 u).
- Modelalias en dagelijks uitgavenplafond voor echte runs.
- Vergadertijden (defaults 09:00 / 13:00 / 16:30) en ochtendbrief (08:15).

## Metriccontract
- Gedeeltelijke annuleringen, cadeaubonnen, verzendretouren: hoe boeken?
- Wisselkoersbron en -datum bij meerdere valuta.
- Testorders: alleen Shopify-vlag of ook tags?
- Gevalideerde sessiebron voor conversie (ShopifyQL beschikbaar op het abonnement?).

## Toegang (nodig per fase)
- Fase 2: Shopify custom app met leesscopes (`read_orders`, `read_products`, `read_inventory`, evt. `read_locations`); >60 dagen historie vereist extra toegang of export.
- Fase 3: Meta-app/token met `ads_read` op het juiste account; Klaviyo private key + conversion metric-ID; Clarity-projecttoken.
- Productie: hostingkeuze (EU-regio), secretmanager, productie-authenticatie (SSO/OIDC?).
