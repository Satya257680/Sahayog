// API client. The session lives in an HttpOnly cookie set by the server (fixes F-08),
// so no token is ever stored in localStorage or readable by JavaScript.
const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export function apiUrl(path) {
  return `${API_URL}${path}`;
}

/**
 * The server sets a non-secret "sahayog_auth=1" cookie next to the HttpOnly session cookie.
 * If it is absent there is no session, so the SPA skips the protected /auth/me request entirely.
 * It is only a hint: the server still authenticates every request with the HttpOnly cookie.
 */
const HINT_COOKIE = "sahayog_auth";
export function hasSessionHint() {
  return (
    typeof document !== "undefined" &&
    document.cookie
      .split(";")
      .some((c) => c.trim().startsWith(`${HINT_COOKIE}=`))
  );
}
export function clearSessionHint() {
  if (typeof document !== "undefined")
    document.cookie = `${HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

/**
 * api('/listings')                         → GET
 * api('/listings', { method: 'POST', body: { … } })
 * Bodies are plain objects; they are JSON-encoded here.
 */
export async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-Requested-With": "sahayog", // required by the server's CSRF guard
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(
      "Cannot reach the Sahayog server. Check your connection and try again.",
      0,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback =
      response.status >= 500
        ? "The server had a problem. Please try again in a moment."
        : "Something went wrong.";
    if (response.status === 401) clearSessionHint();
    if (response.status === 401)
      window.dispatchEvent(
        new CustomEvent("sahayog:unauthorized", { detail: path }),
      );
    throw new ApiError(data.message || fallback, response.status, data);
  }
  return data;
}
