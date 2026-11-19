import { emitKeypressEvents } from 'node:readline';
import { config } from 'dotenv';
import path from 'node:path';
import { createPrisma } from './client';
import { provisionOwner } from './auth';

config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });
function option(name: string): string {
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? process.argv[index + 1] ?? '' : '';
}
async function hidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Gebruik een interactieve terminal; wachtwoorden via argumenten of pipes zijn niet toegestaan.');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Afgebroken.')); }
      else if (key.name === 'return' || key.name === 'enter') { finish(); resolve(value); }
      else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}
const db = createPrisma();
try {
  const email = option('email');
  const displayName = option('name');
  if (!email || !displayName) throw new Error('Gebruik: pnpm --filter @jc/db owner:create --email <email> --name <naam> [--workspace <naam>]');
  const password = await hidden('Wachtwoord (12+ tekens, verborgen): ');
  const confirmation = await hidden('Herhaal wachtwoord: ');
  if (password !== confirmation) throw new Error('Wachtwoorden verschillen.');
  await provisionOwner(db, { email, password, displayName, workspaceName: option('workspace') || 'Julie & Claire' });
  console.log('Productie-owner aangemaakt. Log in met het opgegeven e-mailadres en wachtwoord.');
} catch (error) {
  // Prismafouten kunnen queryparameters bevatten; nooit details loggen.
  console.error(error instanceof Error && !error.name.startsWith('Prisma') ? error.message : 'Owner aanmaken mislukt; controleer database en bestaand account.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
