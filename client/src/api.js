const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function getToken() { return localStorage.getItem('sahayog_token'); }
export function setSession(data) {
  localStorage.setItem('sahayog_token', data.token);
  localStorage.setItem('sahayog_user', JSON.stringify(data.user));
}
export function clearSession() {
  localStorage.removeItem('sahayog_token');
  localStorage.removeItem('sahayog_user');
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem('sahayog_user') || 'null'); } catch { return null; }
}
export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) clearSession();
    throw new Error(data.message || 'Something went wrong.');
  }
  return data;
}
