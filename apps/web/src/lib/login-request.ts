/** Browser-formulieren moeten van de eigen origin komen (ook achter HTTPS-proxy). */
export function loginOriginAllowed(req: Request): boolean {
  const configured = process.env.APP_URL;
  if (process.env.NODE_ENV === 'production' && !configured) return false;
  try {
    const expected = new URL(configured || req.url).origin;
    return req.headers.get('origin') === expected;
  } catch { return false; }
}

export async function readLoginForm(req: Request): Promise<URLSearchParams | null> {
  if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
