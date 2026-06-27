/**
 * src/shared/database/prisma.ts
 *
 * Prisma Client singleton for new TypeScript modules.
 *
 * The existing src/main/database/connection.js (pg pool) remains the
 * authoritative DB connection for all existing JS modules.
 *
 * This client is provided ONLY for new TypeScript features that opt
 * into Prisma instead of raw pg queries.
 *
 * DATABASE_URL must be set in the environment. In development the
 * existing PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD variables are
 * assembled into a connection string if DATABASE_URL is not present.
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';

const log = createLogger('prisma');

function buildDatabaseUrl(): string {
  if (process.env['DATABASE_URL']) {
    return process.env['DATABASE_URL'];
  }

  const host = process.env['PGHOST'] ?? 'localhost';
  const port = process.env['PGPORT'] ?? '5432';
  const db   = process.env['PGDATABASE'] ?? 'star';
  const user = process.env['PGUSER'] ?? 'postgres';
  const pass = encodeURIComponent(process.env['PGPASSWORD'] ?? '');

  return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

declare global {
  // Prevent multiple instances during hot reload in development
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const url = buildDatabaseUrl();

  const client = new PrismaClient({
    datasources: { db: { url } },
    log: [
      { level: 'query',   emit: 'event' },
      { level: 'error',   emit: 'event' },
      { level: 'warn',    emit: 'event' },
    ],
  });

  // Forward Prisma log events to Pino
  client.$on('error' as never, (e: unknown) => log.error(e, 'Prisma error'));
  client.$on('warn'  as never, (e: unknown) => log.warn(e,  'Prisma warning'));

  if (process.env['NODE_ENV'] !== 'production') {
    client.$on('query' as never, (e: unknown) => log.debug(e, 'Prisma query'));
  }

  return client;
}

export const prisma: PrismaClient =
  globalThis.__prismaClient ?? (globalThis.__prismaClient = createPrismaClient());

/** Gracefully disconnect — call on process exit */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  log.info('Prisma disconnected');
}
