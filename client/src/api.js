// API client. The session lives in an HttpOnly cookie set by the server (fixes F-08),
// so no token is ever stored in localStorage or readable by JavaScript.
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export function apiUrl(path) { return `${API_URL}${path}`; }

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
export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Requested-With': 'sahayog' // required by the server's CSRF guard
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the Sahayog server. Check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = response.status >= 500 ? 'The server had a problem. Please try again in a moment.' : 'Something went wrong.';
    if (response.status === 401) window.dispatchEvent(new CustomEvent('sahayog:unauthorized', { detail: path }));
    throw new ApiError(data.message || fallback, response.status, data);
  }
  return data;
}
