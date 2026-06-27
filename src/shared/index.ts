/**
 * src/shared/index.ts
 *
 * Top-level barrel export for the shared layer.
 * Import from '@shared' or specific sub-paths.
 *
 * Prefer specific sub-path imports (e.g. '@shared/logger') to avoid
 * circular dependency issues during incremental migration.
 */

export * from './core';
export * from './types';
// Note: config and logger have side effects on import — use sub-paths
// export * from './config';   // import from '@shared/config' instead
// export * from './logger';   // import from '@shared/logger' instead
