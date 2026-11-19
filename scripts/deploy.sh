#!/bin/sh
# Alleen uitvoeren op de bedoelde Docker-host; geen sudo, verwijdering of secretoutput.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ ! -f .env ]; then echo 'Server-.env ontbreekt; vul die eerst privé in.' >&2; exit 1; fi
chmod 600 .env
docker compose config --quiet
docker compose build web worker
# Start eerst database + modelserver, zodat de worker nooit vóór de modelpull start.
docker compose up -d postgres ollama
attempt=0
until docker exec ollama ollama list >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then echo 'Ollama werd niet binnen 5 minuten gereed.' >&2; exit 1; fi
  sleep 5
done
# Standaard precies: docker exec ollama ollama pull hermes3.
# Lees uitsluitend de niet-geheime modelnaam uit de containeromgeving.
model=$(docker exec ollama printenv OLLAMA_MODEL)
if [ -z "$model" ]; then model=hermes3; fi
if [ "$model" = hermes3 ]; then
  docker exec ollama ollama pull hermes3
else
  docker exec ollama ollama pull "$model"
fi
docker compose up -d
docker compose ps --all
