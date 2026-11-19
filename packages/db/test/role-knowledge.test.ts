import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { Db } from '../src/client';
import { extractRoleSections, validateRoleKnowledgeBundle, seedRoleKnowledge } from '../src/role-knowledge';

const bundle = () => JSON.parse(readFileSync(new URL('../src/seeds/agent-role-knowledge.json', import.meta.url), 'utf8'));
const document = () => Array.from({ length: 11 }, (_, index) => {
  const title = `### 3.${index + 1} Rol ${index + 1}`;
  return title + '\n\n```\n# ROLBLOK\n## Interne kop\n### 3.99 Geen echte sectie\n```\n' + (index === 9 ? '\n#### Content\nContenttekst\n#### Import\nImporttekst\n' : '');
}).join('\n') + '\n## 4. Buiten scope\nNiet importeren\n';

it('preserves all eleven actual sections, including both Product Lister blocks and the watchdog', () => {
  const data = validateRoleKnowledgeBundle(bundle());
  expect(data.items.map((item) => item.section)).toEqual(Array.from({ length: 11 }, (_, i) => `3.${i + 1}`));
  expect(data.items[1]!.title).toContain('Kantoorhond');
  expect(data.items[9]!.body).toContain('# ROLBLOK: PRODUCT LISTER – CONTENT');
  expect(data.items[9]!.body).toContain('# ROLBLOK: PRODUCT LISTER – IMPORT');
  expect(data.items[10]!.body).not.toContain('## 4. Overdrachten');
});
it('ignores fake headings inside fences, keeps subsection contents and stops at chapter 4', () => {
  const items = extractRoleSections(document().replace(/\n/g, '\r\n'));
  expect(items).toHaveLength(11);
  expect(items[0]!.body).toContain('### 3.99 Geen echte sectie');
  expect(items[9]!.body).toContain('Contenttekst');
  expect(items[9]!.body).toContain('Importtekst');
  expect(items[10]!.body).not.toContain('Buiten scope');
});
it('rejects missing, duplicated, reordered or truncated source sections', () => {
  expect(() => extractRoleSections(document().replace('### 3.4 Rol 4', '### Geen rol'))).toThrow();
  expect(() => extractRoleSections(document().replace('### 3.4 Rol 4', '### 3.3 Dubbel'))).toThrow();
  expect(() => extractRoleSections(document().replace('### 3.4 Rol 4', '### 3.5 Te vroeg'))).toThrow();
  expect(() => extractRoleSections(document() + '\n```\n')).toThrow();
});
it('rejects a corrupted bundled body before accessing the database', async () => {
  const data = bundle();
  data.items[0].body += 'Changed';
  const transaction = vi.fn();
  await expect(seedRoleKnowledge({ $transaction: transaction } as unknown as Db, 'ws_target', data)).rejects.toThrow('gewijzigd');
  expect(transaction).not.toHaveBeenCalled();
});
it('requires an existing explicit workspace and writes only draft items scoped to it', async () => {
  const createMany = vi.fn().mockResolvedValue({ count: 11 });
  const findUnique = vi.fn().mockResolvedValue({ id: 'ws_target' });
  const tx = { workspace: { findUnique }, knowledgeDocument: { createMany } };
  const db = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as Db;
  await expect(seedRoleKnowledge(db, '', bundle())).rejects.toThrow('workspace-ID');
  expect(createMany).not.toHaveBeenCalled();
  const result = await seedRoleKnowledge(db, 'ws_target', bundle());
  expect(result).toEqual({ created: 11, skipped: 0, total: 11 });
  expect(findUnique).toHaveBeenCalledWith({ where: { id: 'ws_target' }, select: { id: true } });
  const payload = createMany.mock.calls[0]![0];
  expect(payload.skipDuplicates).toBe(true);
  expect(payload.data).toHaveLength(11);
  expect(payload.data.every((item: { workspaceId: string; status: string }) => item.workspaceId === 'ws_target' && item.status === 'draft')).toBe(true);
  findUnique.mockResolvedValue(null);
  createMany.mockClear();
  await expect(seedRoleKnowledge(db, 'ws_missing', bundle())).rejects.toThrow('bestaat niet');
  expect(createMany).not.toHaveBeenCalled();
});
