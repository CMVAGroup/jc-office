import Link from 'next/link';
import { getPrisma } from '@jc/db';
import { nextPlanned } from '@jc/domain';
import { fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const s = (await getSession())!;
  const db = getPrisma();
  const meetings = await db.meeting.findMany({ where: { workspaceId: s.workspaceId }, orderBy: { startedAt: 'desc' }, take: 50 });
  const schedules = await db.schedule.findMany({ where: { workspaceId: s.workspaceId, kind: 'meeting' }, orderBy: { timeOfDay: 'asc' } });
  const now = new Date();
  return (
    <>
      <h1>Vergaderingen</h1>
      <p className="small muted">Geplande teamvergaderingen draaien in de worker (geen externe agenda-afspraken). Tijden zijn instelbaar onder Instellingen.</p>
      <div className="card">
        <table>
          <thead><tr><th>Overleg</th><th>Tijd</th><th>Dagen</th><th>Volgende</th></tr></thead>
          <tbody>
            {schedules.map((sc) => (
              <tr key={sc.id}><td>{sc.label}</td><td>{sc.timeOfDay} ({sc.timezone})</td><td>{sc.weekdays.join(',')}</td><td>{sc.enabled ? fmtTime(nextPlanned(sc, now)) : 'uitgeschakeld'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Verslagen</h2>
      <ul className="clean card">
        {meetings.length === 0 && <li className="muted">Nog geen vergaderingen.</li>}
        {meetings.map((m) => (
          <li key={m.id}>
            <Link href={`/vergaderingen/${m.id}`}>{m.title}</Link> · {fmtTime(m.startedAt)} <span className={`badge ${m.status}`}>{m.status}</span> {m.isDemo && <span className="badge demo">demo</span>} {m.late && <span className="badge">verlaat</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
