/**
 * src/shared/core/errors.ts
 *
 * Structured error classes for the Enterprise POS application.
 * All new TypeScript modules should throw/return these instead of plain Error.
 */

/** Base class for all POS application errors */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Validation failed — bad input from caller */
export class ValidationError extends AppError {
  public readonly field?: string;
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** Authentication required or token invalid */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/** Caller is authenticated but not permitted */
export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission for this action.') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

/** Requested resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found.`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/** Duplicate / unique constraint violation */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/** Database or infrastructure error */
export class DatabaseError extends AppError {
  public readonly originalError?: unknown;
  constructor(message: string, originalError?: unknown) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/** Convert a PostgreSQL error code into a typed AppError */
export function fromPgError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const pgError = error as { code: string; detail?: string };
    if (pgError.code === '23505') {
      return new ConflictError(pgError.detail ?? 'Duplicate entry.');
    }
    if (pgError.code === '23503') {
      return new ValidationError(pgError.detail ?? 'Foreign key constraint violation.');
    }
  }
  return new DatabaseError('A database error occurred.', error);
}
