/**
 * src/shared/types/index.ts
 *
 * Shared TypeScript type definitions for the Enterprise POS application.
 * These types describe the data shapes already used by the existing JS services.
 *
 * DO NOT modify existing JS service files to import these — types are used
 * only from new TypeScript modules.
 */

// ── Roles ─────────────────────────────────────────────────────────────────────

/** System role names — kept as string union to catch typos at compile time */
export type RoleName =
  | 'Admin'
  | 'Manager'
  | 'Cashier'
  | 'Saleman'   // NOTE: legacy typo in DB — do not rename until migration ticket is resolved
  | 'Warehouse'
  | 'Accountant';

// ── Auth / Session ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: RoleName;
  isActive: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionPayload {
  sub: string;
  username: string;
  email: string;
  role: RoleName;
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

// ── Legacy service response shape ─────────────────────────────────────────────

/**
 * The standard response envelope returned by all existing JS services.
 * New TS services should return Result<T> instead, but this type is useful
 * for cross-module wiring during migration.
 */
export interface ServiceResponse<T = Record<string, unknown>> {
  ok: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface DateRangeFilter {
  dateFrom?: string;  // ISO date string 'YYYY-MM-DD'
  dateTo?: string;
}

export interface SearchFilter {
  search?: string;
}

// ── Money ────────────────────────────────────────────────────────────────────

/** All monetary values in the application are in PKR (Pakistani Rupee) */
export type Money = number;

// ── IPC channel type helper ───────────────────────────────────────────────────

/**
 * Utility type for typing IPC handlers in the main process.
 * Uses unknown for the event to avoid a direct dependency on Electron types
 * from the shared layer. Import electron types in the specific controller file.
 */
export type IpcHandler<TArgs, TResult> = (
  event: unknown,
  args: TArgs
) => Promise<ServiceResponse<TResult>>;
