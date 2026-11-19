# Brug Claude Code -> Codex (ChatGPT). Stelt Codex een vraag en schrijft het antwoord naar de console.
# Standaard ALLEEN LEZEN: Codex mag niets wijzigen of uitvoeren. Gebruik -Write alleen bewust.
# Voorbeeld:  .\scripts\ask-codex.ps1 "Welke producten staan er in mijn Shopify-winkel? Alleen lezen."
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Prompt,
  [switch]$Write
)

$codex = Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin" -Recurse -Filter codex.exe -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $codex) { Write-Error 'Codex niet gevonden. Is de Codex-app geinstalleerd en ingelogd?'; exit 1 }

$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $env:TEMP ("codex-answer-" + [guid]::NewGuid().ToString('N') + '.md')
$sandbox = if ($Write) { 'workspace-write' } else { 'read-only' }
$prefix = 'Je wordt aangeroepen door Claude Code, dat met de eigenaar werkt aan het project in deze map (Julie & Claire AI Office, bedrijf CMVA Commerce). ' +
  'Geef nooit tokens, wachtwoorden of andere secrets terug. Voer geen externe acties uit (geen berichten, geen wijzigingen in Shopify, Klaviyo of andere systemen) tenzij dat expliciet gevraagd is. ' +
  'Zeg eerlijk wat je niet weet. Antwoord in het Nederlands. Vraag: '

& $codex exec --sandbox $sandbox --skip-git-repo-check --ephemeral -C $root -o $out ($prefix + $Prompt) *> $null
if (Test-Path $out) { Get-Content $out -Raw; Remove-Item $out } else { Write-Error 'Codex gaf geen antwoord.'; exit 1 }
