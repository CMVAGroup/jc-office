// Eenmalig/handmatig; nooit automatisch bij workerstart of deploy uitvoeren.
// Geen dotenv: alleen expliciet ingestelde procesomgeving, geen secretsbestanden lezen.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrisma, type Db } from './client';
import { contentSha256, extractRoleSections, seedRoleKnowledge, validateRoleKnowledgeBundle, type RoleKnowledgeBundle } from './role-knowledge';

const HELP = 'Gebruik: pnpm --filter @jc/db knowledge:seed-roles --workspace <workspace-id> [--file <ontwerp.md>] [--dry-run]';
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); return; }
  let workspaceId = '';
  let file: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') { dryRun = true; continue; }
    if (arg !== '--workspace' && arg !== '--file') throw new Error(HELP);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(HELP);
    if (arg === '--workspace') workspaceId = value;
    else file = value;
  }
  if (!workspaceId.trim()) throw new Error(HELP);
  let rawBundle: unknown;
  if (file) {
    // Relatief aan de projectroot, niet pnpm's pakketwerkmap.
    const fullPath = path.resolve(import.meta.dirname, '../../..', file);
    const markdown = await readFile(fullPath, 'utf8');
    rawBundle = { sourceName: path.basename(fullPath), sourceSha256: contentSha256(markdown), items: extractRoleSections(markdown) } satisfies RoleKnowledgeBundle;
  } else {
    rawBundle = JSON.parse(await readFile(path.join(import.meta.dirname, 'seeds/agent-role-knowledge.json'), 'utf8'));
  }
  const bundle = validateRoleKnowledgeBundle(rawBundle);
  if (dryRun) {
    console.log(`[seed-roles] ${bundle.items.length} rolsecties geldig; status draft; geen databaseverbinding of writes.`);
    for (const item of bundle.items) console.log(`  ${item.section} ${item.slug}: ${item.title}`);
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ontbreekt. Gebruik de Docker-entrypoint of configureer de procesomgeving privé.');
  let db: Db | undefined;
  try {
    db = createPrisma();
    const result = await seedRoleKnowledge(db, workspaceId, bundle);
    console.log(`[seed-roles] ${result.created} aangemaakt als draft; ${result.skipped} bestaande items ongemoeid gelaten (${result.total} secties).`);
  } finally { if (db) await db.$disconnect(); }
}
main().catch(() => {
  // Geen documentinhoud, credentialwaarden, URL, queryparameters of ruwe providerfout loggen.
  console.error('[seed-roles] Import mislukt. Controleer argumenten (--help), de 11 bronsecties, workspace en database/migraties. Er zijn geen foutdetails of secrets gelogd.');
  process.exitCode = 1;
});
