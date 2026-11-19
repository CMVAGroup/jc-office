import { getPrisma } from '@jc/db';
import { demoLoginAllowed } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ROLE_TEXT: Record<string, string> = {
  owner: 'Eigenaar — mag goedkeuren, instellingen wijzigen en de noodstop bedienen',
  operator: 'Operator — mag taken en voorstellen maken, niet goedkeuren',
  viewer: 'Kijker — alleen lezen',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const allowed = demoLoginAllowed();
  const users = allowed
    ? await getPrisma().user.findMany({ where: { isDemo: true, memberships: { some: { workspaceId: 'ws_demo' } } }, include: { memberships: true }, orderBy: { email: 'asc' } })
    : [];
  return (
    <main className="login-wrap">
      <div className="card">
        <h1>Julie &amp; Claire AI Office</h1>
        {allowed ? (
          <>
            <p className="notice card small">
              <strong>Demologin.</strong> Werkt alleen met <code>DEMO_MODE=true</code> buiten productie. Geen wachtwoorden; alle data is demofixture.
            </p>
            <ul className="clean">
              {users.map((u) => (
                <li key={u.id}>
                  <form action="/api/auth/demo-login" method="post" className="row">
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="primary" data-testid={`login-${u.memberships[0]?.role}`}>
                      Inloggen als {u.displayName}
                    </button>
                    <span className="small muted">{ROLE_TEXT[u.memberships[0]?.role ?? ''] ?? ''}</span>
                  </form>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <form action="/api/auth/login" method="post">
            {error && <p role="alert">E-mailadres of wachtwoord onjuist.</p>}
            <p><label htmlFor="email">E-mailadres</label><br /><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} /></p>
            <p><label htmlFor="password">Wachtwoord</label><br /><input id="password" name="password" type="password" autoComplete="current-password" required /></p>
            <button type="submit" className="primary">Inloggen</button>
          </form>
        )}
      </div>
    </main>
  );
}
