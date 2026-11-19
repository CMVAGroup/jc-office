import { NextResponse } from 'next/server';
import { authenticatePassword, getPrisma } from '@jc/db';
import { SESSION_COOKIE, signSession } from '../../../../lib/session';
import { loginOriginAllowed, readLoginForm } from '../../../../lib/login-request';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!loginOriginAllowed(req)) return NextResponse.json({ error: 'Ongeldige herkomst' }, { status: 403 });
  try {
    const form = await readLoginForm(req);
    if (!form) return NextResponse.json({ error: 'Ongeldig formulier' }, { status: 400 });
    const result = await authenticatePassword(getPrisma(), form.get('email') ?? '', form.get('password') ?? '');
    if (result.status === 'limited') return NextResponse.json({ error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' }, { status: 429, headers: { 'Retry-After': '900', 'Cache-Control': 'no-store' } });
    if (result.status !== 'ok') return new NextResponse(null, { status: 303, headers: { Location: '/login?error=invalid', 'Cache-Control': 'no-store' } });
    const token = signSession({ userId: result.userId, workspaceId: result.workspaceId });
    const response = new NextResponse(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 3600 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Inloggen tijdelijk niet beschikbaar' }, { status: 503 });
  }
}
