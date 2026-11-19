import { json, withAuth } from '@/lib/api';
import { getOfficeState } from '@/lib/office-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withAuth('read', async (s) => json(await getOfficeState(s.workspaceId)));
}
