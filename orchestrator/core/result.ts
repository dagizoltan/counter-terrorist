/**
 * A standardized Result type for predictable error handling across the mesh.
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const ok = <T>(data: T): Result<T, never> => ({ success: true, data });

export const err = <E>(error: E): Result<never, E> => ({ success: false, error });

/**
 * Utility to wrap async functions into a Result.
 */
export async function wrapResult<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
