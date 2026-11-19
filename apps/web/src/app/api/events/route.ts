// SSE-eventfeed met cursor. Herstel na reconnect: client stuurt laatste cursor (of Last-Event-ID) mee.
import { getPrisma } from '@jc/db';
import { can } from '@jc/policy';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !can(s.role, 'read')) return new Response('Niet ingelogd', { status: 401 });
  const url = new URL(req.url);
  let cursor = Number(req.headers.get('last-event-id') ?? url.searchParams.get('cursor') ?? 0) || 0;
  const db = getPrisma();
  const enc = new TextEncoder();
  let closed = false;
  req.signal.addEventListener('abort', () => (closed = true));
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(`retry: 3000\n\n`));
      let idle = 0;
      while (!closed) {
        try {
          const events = await db.officeEvent.findMany({
            where: { workspaceId: s.workspaceId, id: { gt: cursor } },
            orderBy: { id: 'asc' },
            take: 100,
          });
          for (const e of events) {
            cursor = e.id;
            const data = { id: e.id, kind: e.kind, taskId: e.taskId, meetingId: e.meetingId, agentRole: e.agentRole, payload: e.payload, createdAt: e.createdAt };
            controller.enqueue(enc.encode(`id: ${e.id}\nevent: office\ndata: ${JSON.stringify(data)}\n\n`));
          }
          if (!events.length && ++idle % 15 === 0) controller.enqueue(enc.encode(`: keepalive\n\n`));
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        controller.close();
      } catch {
        /* al gesloten */
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
