import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/', label: 'Kantoor' },
  { href: '/vandaag', label: 'Vandaag' },
  { href: '/taken', label: 'Taken' },
  { href: '/vergaderingen', label: 'Vergaderingen' },
  { href: '/goedkeuringen', label: 'Goedkeuringen' },
  { href: '/instellingen', label: 'Instellingen' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const ollama = process.env.MODEL_PROVIDER === 'ollama';
  const mock = !ollama && !(process.env.MODEL_PROVIDER === 'anthropic' && process.env.ALLOW_REAL_MODEL_RUNS === 'true');
  return (
    <>
      <header className="topbar">
        <span className="brand">Julie &amp; Claire AI Office</span>
        <nav className="nav" aria-label="Hoofdnavigatie">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          <span>
            {s.displayName} · <strong>{s.role}</strong>
          </span>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Uitloggen</button>
          </form>
        </div>
      </header>
      <div className="demo-banner" role="note">
        <strong>DEMO</strong> · alle brondata is fixture (demo/niet gekoppeld) · model: {ollama ? 'Ollama (lokaal, CPU)' : mock ? 'mockadapter (geen taalmodel, geen kosten)' : 'Anthropic (echte runs)'} · externe writes hard
        uitgeschakeld
      </div>
      <main>{children}</main>
    </>
  );
}
