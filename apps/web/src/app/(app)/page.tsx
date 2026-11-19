import OfficeView from '@/components/OfficeView';
import { getOfficeState } from '@/lib/office-state';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OfficePage() {
  const s = (await getSession())!;
  const state = await getOfficeState(s.workspaceId);
  return (
    <>
      <h1 className="sr-only">Kantoor</h1>
      <OfficeView initial={state} role={s.role} />
    </>
  );
}
