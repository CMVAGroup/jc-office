import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/prisma/client';

export { Prisma, PrismaClient };
export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient;

const globalForPrisma = globalThis as unknown as { __jcPrisma?: PrismaClient };

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL ontbreekt (zie .env.example)');
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

/** Gedeelde client per proces (Next.js hot reload maakt anders telkens nieuwe pools). */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__jcPrisma) globalForPrisma.__jcPrisma = createPrisma();
  return globalForPrisma.__jcPrisma;
}
