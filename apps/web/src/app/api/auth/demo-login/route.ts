import { NextResponse } from 'next/server';
import { getPrisma } from '@jc/db';
import { demoLoginAllowed, SESSION_COOKIE, signSession } from '@/lib/session';

// Demologin: kies een demogebruiker zonder wachtwoord. Werkt UITSLUITEND met DEMO_MODE=true buiten productie.
export async function POST(req: Request) {
  if (!demoLoginAllowed()) return NextResponse.json({ error: 'Demologin is uitgeschakeld' }, { status: 403 });
  const form = await req.formData();
  const userId = String(form.get('userId') ?? '');
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { id: userId }, include: { memberships: true } });
  if (!user || !user.isDemo || !user.memberships[0]) return NextResponse.json({ error: 'Onbekende demogebruiker' }, { status: 400 });
  const token = signSession({ userId: user.id, workspaceId: user.memberships[0].workspaceId });
  // Relatieve redirect: blijft op dezelfde host als waar de cookie is gezet.
  const res = new NextResponse(null, { status: 303, headers: { Location: '/' } });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 3600 });
  return res;
}
