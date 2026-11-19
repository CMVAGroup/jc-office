import Link from 'next/link';
import { getPrisma } from '@jc/db';
import { AGENT_ROLES, ROLE_LABELS, TASK_STATUS_LABELS, TASK_STATUSES } from '@jc/domain';
import { fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  const s = (await getSession())!;
  const tasks = await getPrisma().task.findMany({
    where: { workspaceId: s.workspaceId, ...(agent ? { agentRole: agent } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  return (
    <>
      <h1>Taken</h1>
      <nav className="row small" aria-label="Filter per agent">
        <Link href="/taken">Alle</Link>
        {AGENT_ROLES.map((r) => (
          <Link key={r} href={`/taken?agent=${r}`} aria-current={agent === r ? 'page' : undefined}>
            {ROLE_LABELS[r]}
          </Link>
        ))}
      </nav>
      <div className="board" style={{ marginTop: '0.75rem' }}>
        {TASK_STATUSES.map((st) => (
          <section key={st} className="col" aria-label={TASK_STATUS_LABELS[st]}>
            <h3>
              {TASK_STATUS_LABELS[st]} ({tasks.filter((t) => t.status === st).length})
            </h3>
            {tasks
              .filter((t) => t.status === st)
              .map((t) => (
                <Link key={t.id} href={`/taken/${t.id}`} className="task-card" data-testid="task-card">
                  <strong>{t.title}</strong> {t.isDemo && <span className="badge demo">demo</span>}
                  <div className="muted small">
                    {ROLE_LABELS[t.agentRole as keyof typeof ROLE_LABELS] ?? t.agentRole} · {fmtTime(t.updatedAt)}
                  </div>
                  {t.progressNote && <div className="small">{t.progressNote}</div>}
                  {t.failureReason && <div className="small" style={{ color: 'var(--danger)' }}>{t.failureReason}</div>}
                </Link>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
