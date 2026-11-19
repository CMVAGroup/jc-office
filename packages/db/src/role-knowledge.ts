// Het ontwerp is brondata, geen opdracht aan de importer of wijziging van agentrechten.
import { createHash } from 'node:crypto';
import type { Db } from './client';

export interface RoleKnowledgeItem {
  section: string;
  slug: string;
  title: string;
  body: string;
  sha256: string;
}
export interface RoleKnowledgeBundle {
  sourceName: string;
  sourceSha256: string;
  items: RoleKnowledgeItem[];
}
export function contentSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Eén item per sectie 3.1..3.11; negeert alle koppen binnen codeblokken. */
export function extractRoleSections(markdown: string): RoleKnowledgeItem[] {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const items: RoleKnowledgeItem[] = [];
  let fence: { char: string; length: number } | null = null;
  let section: { index: number; title: string; start: number } | null = null;
  const closeSection = (end: number) => {
    if (!section) return;
    const body = lines.slice(section.start, end).join('\n').trimEnd() + '\n';
    const number = `3.${section.index}`;
    items.push({ section: number, slug: `agent-role-3-${String(section.index).padStart(2, '0')}`, title: `${number} ${section.title}`, body, sha256: contentSha256(body) });
    section = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceLine = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (fenceLine && fenceLine[1]![0] === fence.char && fenceLine[1]!.length >= fence.length && !fenceLine[2]!.trim()) fence = null;
      continue;
    }
    if (fenceLine) { fence = { char: fenceLine[1]![0]!, length: fenceLine[1]!.length }; continue; }
    const heading = line.match(/^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    closeSection(i);
    const role = heading[1] === '###' ? heading[2]!.match(/^3\.(\d+)\s+(.+)$/) : null;
    if (role) {
      const index = Number(role[1]);
      if (index < 1 || index > 11) throw new Error('Onverwachte rolsectie buiten 3.1 t/m 3.11.');
      section = { index, title: role[2]!, start: i };
    }
  }
  if (fence) throw new Error('Ontwerp bevat een niet-afgesloten codeblok.');
  closeSection(lines.length);
  if (items.length !== 11 || items.some((item, index) => item.section !== `3.${index + 1}`)) {
    throw new Error('Ontwerp moet secties 3.1 t/m 3.11 precies eenmaal en in volgorde bevatten.');
  }
  return items;
}

/** Controleer de complete bundel vóór enige databaseactie. */
export function validateRoleKnowledgeBundle(value: unknown): RoleKnowledgeBundle {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige rollenbundel.');
  const bundle = value as RoleKnowledgeBundle;
  if (typeof bundle.sourceName !== 'string' || !bundle.sourceName.trim() || !/^[a-f0-9]{64}$/.test(bundle.sourceSha256 ?? '') || !Array.isArray(bundle.items) || bundle.items.length !== 11) {
    throw new Error('Ongeldige rollenbundel of bronverwijzing.');
  }
  for (let i = 0; i < bundle.items.length; i++) {
    const item = bundle.items[i];
    const expected = `3.${i + 1}`;
    if (!item || item.section !== expected || item.slug !== `agent-role-3-${String(i + 1).padStart(2, '0')}` || typeof item.title !== 'string' || !item.title.startsWith(expected + ' ') || typeof item.body !== 'string' || !item.body.trim() || contentSha256(item.body) !== item.sha256) {
      throw new Error('Rollenbundel onvolledig, onjuist geordend of inhoud gewijzigd.');
    }
    const parsed = extractSingleRole(item.body, expected);
    if (!parsed) throw new Error('Inhoud past niet bij de opgegeven rolsectie.');
  }
  return bundle;
}
function extractSingleRole(body: string, section: string): boolean {
  return body.split('\n')[0]?.startsWith(`### ${section} `) ?? false;
}

/** CLI-seed: geen API-route. Alleen bestaande workspace, nooit demo- of eigenaarseed. */
export async function seedRoleKnowledge(db: Db, workspaceId: string, rawBundle: unknown) {
  if (!workspaceId.trim()) throw new Error('Een expliciete workspace-ID is verplicht.');
  const bundle = validateRoleKnowledgeBundle(rawBundle);
  return db.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) throw new Error('Workspace bestaat niet; maak eerst het owner-account aan.');
    // Uniek (workspaceId, slug) en skipDuplicates bewaren ook menselijke/publiceerde edits.
    const result = await tx.knowledgeDocument.createMany({
      data: bundle.items.map((item) => ({
        workspaceId,
        slug: item.slug,
        title: item.title,
        status: 'draft',
        ownerName: null,
        source: `${bundle.sourceName}#${item.section}; document-sha256=${bundle.sourceSha256}; section-sha256=${item.sha256}`,
        body: item.body,
      })),
      skipDuplicates: true,
    });
    return { created: result.count, skipped: bundle.items.length - result.count, total: bundle.items.length };
  });
}
