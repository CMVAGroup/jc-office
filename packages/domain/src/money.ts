// Geld wordt altijd als geheel getal in de kleinste valuta-eenheid (minor units) gerekend.

export function assertMinor(n: number, label = 'bedrag'): number {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} moet een veilig geheel getal (minor units) zijn: ${n}`);
  return n;
}

/** Deling met afronding half-up naar een geheel aantal minor units. */
export function divideMinorRound(numerator: number, denominator: number): number {
  assertMinor(numerator, 'teller');
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('noemer moet > 0 zijn');
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const q = Math.floor(abs / denominator);
  const r = abs - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

export function formatMinor(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor === null || minor === undefined) return 'onbekend';
  const cur = currency ?? 'EUR';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: cur }).format(minor / 100);
}
