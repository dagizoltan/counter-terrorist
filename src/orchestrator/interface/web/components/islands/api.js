/**
 * Shared API client for the islands.
 *
 * WHY THIS EXISTS
 * ---------------
 * apiConsistencyMiddleware wraps every /api/* JSON response as
 * `{ success: true, data: <payload> }`. The islands were written against the
 * unwrapped payload: an audit of the 48 API reads across 31 islands found 42
 * that never accounted for the envelope. So `await res.json()` handed them
 * `{success, data}` where they expected an array or a record, and the next
 * line — `.forEach`, `.map`, `.filter`, `.sort`, `.length` — threw or silently
 * produced nothing. That is why most of the console rendered empty panels.
 *
 * `unwrap` is the single place that knows about the envelope.
 *
 *   const logs = await unwrap(res);        // array, as the handler returned it
 *   const data = await apiGet('/api/x');   // fetch + CSRF + unwrap in one call
 *
 * A response that carries `success` but no `data` is returned whole, so the
 * `if (result.success)` checks on POST actions keep working unchanged.
 */

/** The CSRF token lives in a meta tag, never on window (SEC-02). */
export function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

/** Standard headers for an authenticated island request. */
export function apiHeaders(extra = {}) {
  const token = csrfToken();
  return token ? { "X-CT-Token": token, ...extra } : { ...extra };
}

/**
 * Read a Response and strip the API envelope.
 *
 * - `{ success: true, data: X }` -> `X`
 * - `{ success: false, error }`  -> throws
 * - `{ success: true, ... }`     -> returned whole (no `data` key to unwrap)
 * - anything else                -> returned as-is
 *
 * An empty or non-JSON body yields `null` rather than throwing, so a caller
 * that only checks `res.ok` behaves as it did before.
 */
export async function unwrap(res) {
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }

  if (body && typeof body === "object" && !Array.isArray(body) && "success" in body) {
    if (body.success === false) {
      const err = new Error(body.error?.message ?? body.error ?? "Request failed");
      err.code = body.error?.code ?? body.code;
      throw err;
    }
    return "data" in body ? body.data : body;
  }

  return body;
}

/** GET an endpoint and return its unwrapped payload. Throws on a non-2xx. */
export async function apiGet(url, init = {}) {
  const res = await fetch(url, { ...init, headers: apiHeaders(init.headers) });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return await unwrap(res);
}

/** POST/PUT/DELETE with a JSON body. Returns the unwrapped payload. */
export async function apiSend(url, method, body, init = {}) {
  const res = await fetch(url, {
    ...init,
    method,
    headers: apiHeaders({ "Content-Type": "application/json", ...init.headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return await unwrap(res);
}
