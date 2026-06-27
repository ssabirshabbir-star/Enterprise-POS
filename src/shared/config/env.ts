/**
 * src/shared/config/env.ts
 *
 * Typed environment variable access for new TypeScript modules.
 *
 * The existing src/main/config/env.js continues to manage environment
 * loading for the main Electron process. This module provides typed
 * access to the same variables for use in TS modules.
 *
 * DO NOT call dotenv.config() here — that is done by main.js on startup.
 */

import { z } from 'zod';

// ── Schema ────────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().optional(),
  PGHOST: z.string().optional().default('localhost'),
  PGPORT: z.coerce.number().optional().default(5432),
  PGDATABASE: z.string().optional().default('star'),
  PGUSER: z.string().optional().default('postgres'),
  PGPASSWORD: z.string().optional().default(''),
  PGPOOL_MAX: z.coerce.number().optional().default(8),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().optional().default('15m'),
  JWT_REFRESH_TTL: z.string().optional().default('7d'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  ELECTRON_IS_PACKAGED: z.string().optional(),
  POS_TERMINAL_CODE: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional().default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

// ── Lazy singleton — parsed once on first access ──────────────────────────────

let _env: Env | undefined;

/**
 * Returns typed environment variables.
 * Throws if required variables are missing.
 * Call only after main.js has loaded .env via loadEnvironment().
 */
export function getEnv(): Env {
  if (_env) return _env;

  // Provide fallbacks for the access/refresh secrets in development
  const isProduction =
    process.env['NODE_ENV'] === 'production' ||
    process.env['ELECTRON_IS_PACKAGED'] === 'true';

  const raw = {
    ...process.env,
    JWT_ACCESS_SECRET:
      process.env['JWT_ACCESS_SECRET'] ??
      (isProduction ? undefined : 'enterprise-pos-local-access-secret-change-me'),
    JWT_REFRESH_SECRET:
      process.env['JWT_REFRESH_SECRET'] ??
      (isProduction ? undefined : 'enterprise-pos-local-refresh-secret-change-me'),
  };

  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment configuration is invalid:\n${issues}`);
  }

  _env = result.data;
  return _env;
}

/** Reset cached env — used in tests only */
export function _resetEnv(): void {
  _env = undefined;
}

// ── Convenience accessors ─────────────────────────────────────────────────────

export function isProduction(): boolean {
  const env = getEnv();
  return env.NODE_ENV === 'production' || env.ELECTRON_IS_PACKAGED === 'true';
}

export function isDevelopment(): boolean {
  return !isProduction();
}
