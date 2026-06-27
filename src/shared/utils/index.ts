/**
 * src/shared/utils/index.ts
 *
 * Shared utility functions — typed equivalents of the helpers
 * copy-pasted into individual JS modules (money, esc, safeError, etc.)
 *
 * Existing JS modules continue to use their local copies.
 * New TypeScript modules import from here.
 */

export * from './format';
export * from './validation';
