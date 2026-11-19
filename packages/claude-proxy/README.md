# Claude Code HTTP proxy — Phase 9

Zelfstandig TypeScript/ESM-pakket zonder runtime-dependencies. Start met
`pnpm --filter @jc/claude-proxy start` op Node >=22.18 (Docker gebruikt Node 24).
Standaard uit: alleen CLAUDE_PROXY_ENABLED=true accepteert modelrequests.
GET /health controleert uitsluitend de HTTP-server, niet CLI-installatie of login.

POST /v1/chat/completions met Content-Type: application/json:

```json
{
  "model": "claude-code",
  "messages": [
    { "role": "system", "content": "Antwoord kort." },
    { "role": "user", "content": "Hallo" }
  ]
}
```

Messages worden op volgorde als rol + tekst aan één prompt toegevoegd. Tekstarrays
worden ondersteund. Alleen model, messages, stream=false en n=1 worden geaccepteerd;
streaming, tools, afbeeldingen en generatieparameters geven expliciet HTTP 400.
model is een clientlabel in de respons: de CLI gebruikt zijn eigen standaardmodel.
Geen verzonnen tokenusage: het optionele usage-veld wordt weggelaten.

De CLI wordt zonder shell aangeroepen als claude -p <prompt> met tekstoutput,
uitgeschakelde tools/MCP/hooks en zonder sessieopslag of geladen user/project-settings.
Zie de [officiële CLI-reference](https://code.claude.com/docs/en/cli-reference).
Maximaal 64 KiB invoer, 1 MiB uitvoer, één actieve request en 120 s CLI-timeout.
Clientdisconnect annuleert de CLI. Fouten bevatten geen stderr of promptinhoud.

Compose bouwt een aparte image met Claude Code geïnstalleerd, draait als node en
publiceert uitsluitend 127.0.0.1:11435. Andere frontend-containers bereiken
http://claude-proxy:11435. Geen hostproject of persoonlijke configuratie gemount.
Authenticatie moet vóór echt gebruik afzonderlijk door de eigenaar worden geregeld;
geen credentials, loginbestanden of secrets worden door deze fase meegeleverd.

Dit levert alleen de wrapper en Compose-configuratie. De bestaande @jc/ai-factory
heeft nog geen claude-proxy-adapter; MODEL_PROVIDER=claude-proxy activeert daarom
nog geen proxygebruik in de worker. Die vervolgintegratie valt buiten Phase 9.
Geen VPS-start, deployment of echte modelcall uitgevoerd.
