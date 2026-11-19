#!/bin/sh
# Uitvoeren in postgres:17-bookworm. Credentials uitsluitend via runtimeomgeving.
# Eenmalig: /bin/sh /scripts/backup.sh ; continu: dezelfde opdracht met --loop.
set -eu
umask 077
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_UTC_HOUR="${BACKUP_UTC_HOUR:-3}"
case "$BACKUP_UTC_HOUR" in
  ''|*[!0-9]*) echo 'Ongeldig back-upuur (UTC).' >&2; exit 1 ;;
esac
if [ "$BACKUP_UTC_HOUR" -gt 23 ]; then echo 'Ongeldig back-upuur (UTC).' >&2; exit 1; fi
: "${PGHOST:?PGHOST ontbreekt}" "${PGUSER:?PGUSER ontbreekt}" "${PGPASSWORD:?PGPASSWORD ontbreekt}" "${PGDATABASE:?PGDATABASE ontbreekt}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
tmp=''
cleanup() { if [ -n "$tmp" ]; then rm -f -- "$tmp"; fi; }
trap cleanup EXIT
trap 'exit 0' INT TERM

backup_once() {
  stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  tmp=$(mktemp "$BACKUP_DIR/.office-$stamp.XXXXXX") || return 1
  if ! pg_dump --format=custom --no-password --file="$tmp"; then
    cleanup; tmp=''; echo 'Databaseback-up mislukt.' >&2; return 1
  fi
  if ! pg_restore --list "$tmp" >/dev/null; then
    cleanup; tmp=''; echo 'Back-uparchief onleesbaar.' >&2; return 1
  fi
  if ! mv -- "$tmp" "$BACKUP_DIR/office-$stamp.dump"; then
    cleanup; tmp=''; echo 'Back-up opslaan mislukt.' >&2; return 1
  fi
  tmp=''
  # Alleen eigen voltooide dumps ouder dan 14 dagen.
  if ! find "$BACKUP_DIR" -maxdepth 1 -type f -name 'office-*.dump' -mmin +20160 -delete; then
    echo 'Back-upretentie opruimen mislukt.' >&2; return 1
  fi
  printf '%s Databaseback-up voltooid; bewaartermijn 14 dagen.\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}

case "${1:-}" in
  '') backup_once ;;
  --loop)
    # Meteen een eerste kopie; daarna dagelijks om BACKUP_UTC_HOUR:00 UTC.
    # Bij fouten elke 15 minuten opnieuw proberen; bestaande dumps behouden.
    while :; do
      if ! backup_once; then sleep 900 & wait $!; continue; fi
      now=$(date -u '+%s')
      next=$(date -u -d "today $BACKUP_UTC_HOUR:00:00" '+%s')
      if [ "$next" -le "$now" ]; then next=$(date -u -d "tomorrow $BACKUP_UTC_HOUR:00:00" '+%s'); fi
      sleep "$((next - now))" & wait $!
    done
    ;;
  *) echo 'Gebruik: backup.sh [--loop]' >&2; exit 1 ;;
esac
