/**
 * prisma.config.ts
 *
 * Prisma configuration file (replaces deprecated package.json#prisma field).
 * Supported since Prisma 6.
 *
 * See: https://pris.ly/prisma-config
 */

import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: false,
  schema: 'prisma/schema.prisma',
});
