import path from 'node:path';
import { config } from 'dotenv';
import { createPrisma } from './client';
import { seedDemo } from './seed-lib';

const root = path.resolve(import.meta.dirname, '../../..');
config({ path: path.join(root, '.env'), quiet: true });

const db = createPrisma();
const res = await seedDemo(db, { knowledgeDir: path.join(root, 'knowledge', 'julie-claire'), force: process.argv.includes('--force') });
console.log(res.created ? '[seed] demodata aangemaakt (alles gelabeld als demo)' : '[seed] demo-workspace bestaat al; overgeslagen');
await db.$disconnect();
