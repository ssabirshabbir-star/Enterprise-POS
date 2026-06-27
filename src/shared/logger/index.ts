/**
 * src/shared/logger/index.ts
 *
 * Pino-based structured logger for the Enterprise POS main process.
 *
 * Usage (new TS modules only):
 *   import { createLogger } from '@shared/logger';
 *   const log = createLogger('billing');
 *   log.info({ invoiceId }, 'Invoice created');
 *   log.error({ err }, 'Payment failed');
 *
 * Existing JS modules use console.log/error — those are unchanged.
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

// ── Log level from environment ────────────────────────────────────────────────

function resolveLevel(): pino.LevelWithSilent {
  const level = process.env['LOG_LEVEL'];
  const valid = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
  if (level && valid.includes(level)) return level as pino.LevelWithSilent;
  return process.env['NODE_ENV'] === 'production' ? 'info' : 'debug';
}

// ── Transport ─────────────────────────────────────────────────────────────────

function buildTransport(): LoggerOptions['transport'] {
  // In development use pino-pretty for readable output.
  // In production log plain JSON to stdout for log aggregators.
  if (process.env['NODE_ENV'] !== 'production') {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };
  }
  return undefined;
}

// ── Root logger ───────────────────────────────────────────────────────────────

const rootLogger: Logger = pino({
  level: resolveLevel(),
  transport: buildTransport(),
  base: {
    pid: process.pid,
    app: 'enterprise-pos',
  },
});

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a child logger scoped to a module / feature.
 *
 * @param module  Human-readable module name (e.g. 'billing', 'auth', 'products')
 * @param context Optional additional static fields added to every log entry
 */
export function createLogger(
  module: string,
  context?: Record<string, unknown>
): Logger {
  return rootLogger.child({ module, ...context });
}

/** The shared root logger instance — prefer createLogger() for feature modules */
export { rootLogger as logger };
export type { Logger };
