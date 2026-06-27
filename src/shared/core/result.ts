/**
 * src/shared/core/result.ts
 *
 * A typed Result<T, E> discriminated union for safe, explicit error handling.
 * Used throughout new TypeScript modules instead of throw/catch.
 *
 * Pattern:
 *   const result = await someService.doThing();
 *   if (!result.ok) { return result; }  // narrowed to Err<E>
 *   use(result.data);                    // narrowed to Ok<T>
 *
 * Mirrors the existing { ok: boolean, ... } convention already used
 * by the JS services, making migration natural.
 */

export type Ok<T> = { readonly ok: true; readonly data: T };
export type Err<E = string> = { readonly ok: false; readonly error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

/** Construct a successful result */
export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

/** Construct a failure result */
export function err<E = string>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard: is this result a success? */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/** Type guard: is this result a failure? */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Converts a legacy JS-style response `{ ok, message, ... }` into a typed Result.
 * Use during migration of existing service calls.
 */
export function fromLegacy<T extends Record<string, unknown>>(
  response: T & { ok: boolean; message?: string }
): Result<T, string> {
  if (response.ok) return ok(response);
  return err(response.message ?? 'Request failed.');
}
