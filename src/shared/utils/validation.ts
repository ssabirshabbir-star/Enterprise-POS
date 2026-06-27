/**
 * src/shared/utils/validation.ts
 *
 * Reusable Zod schemas for domain primitives shared across modules.
 *
 * These are type-only schemas — they do NOT replace any existing
 * validation logic in JS service files.
 */

import { z } from 'zod';

// ── Primitive validators ───────────────────────────────────────────────────────

/** Positive integer ID (e.g. database row IDs) */
export const IdSchema = z.number().int().positive();

/** Non-empty trimmed string */
export const NonEmptyStringSchema = z.string().min(1).transform((s) => s.trim());

/** Valid email */
export const EmailSchema = z.string().email().toLowerCase();

/** Phone number (loose — just non-empty for now) */
export const PhoneSchema = z.string().min(1).max(60).optional();

/** Non-negative monetary value (max 2dp) */
export const MoneySchema = z
  .number()
  .nonnegative()
  .refine((n) => Number.isFinite(n), { message: 'Must be a finite number' })
  .transform((n) => Number(n.toFixed(2)));

/** Positive quantity (max 3dp) */
export const QuantitySchema = z
  .number()
  .positive()
  .transform((n) => Number(n.toFixed(3)));

/** ISO date string 'YYYY-MM-DD' */
export const IsoDatStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

/** Pagination */
export const PaginationSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(500).optional().default(50),
});

// ── Auth schemas ──────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: NonEmptyStringSchema,
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ── Date range filter ─────────────────────────────────────────────────────────

export const DateRangeSchema = z.object({
  dateFrom: IsoDatStringSchema.optional(),
  dateTo: IsoDatStringSchema.optional(),
});

// ── Type helpers ─────────────────────────────────────────────────────────────

export type LoginInput = z.infer<typeof LoginSchema>;
export type DateRangeInput = z.infer<typeof DateRangeSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
