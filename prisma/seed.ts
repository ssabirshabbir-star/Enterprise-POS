/**
 * prisma/seed.ts
 *
 * Prisma seed script — NOT a replacement for scripts/seed-admin.js
 *
 * This file is registered as `prisma.seed` in package.json for use with
 * `npx prisma db seed`. It delegates to the existing seed scripts during
 * the migration period so there is no duplication of seed logic.
 *
 * Usage:
 *   npx prisma db seed
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const seedScript = resolve(__dirname, '../scripts/seed-admin.js');

console.log('[prisma/seed] Delegating to existing seed-admin.js...');
execSync(`node "${seedScript}"`, { stdio: 'inherit' });
console.log('[prisma/seed] Seed complete.');
