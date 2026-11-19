import path from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// Eén .env in de repo-root voor web en worker.
config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  transpilePackages: ['@jc/ai', '@jc/domain', '@jc/db', '@jc/agents', '@jc/policy', '@jc/ui', '@jc/connectors'],
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', '@anthropic-ai/sdk'],
  poweredByHeader: false,
  outputFileTracingExcludes: {
    '/*': ['../../.env*', '../../**/.env*', '../../infra/**/*', '../../**/backups/**/*', '../../**/*.dump', '../../**/*.key', '../../**/*.pem'],
  },
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
};

export default nextConfig;
