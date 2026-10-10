import { humanize } from "./errors";

// The Brelo API client. Same contract as the web app's: a bearer token, the active company
// in X-Company-ID, and errors that arrive as { error: { code, message } } with a message
// written for the person using the app.

const BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8080") + "/api/v1";

const TOKEN = "auth_token";
const COMPANY = "active_company_id";

// Storage can be unavailable (a private window, a locked-down webview). The app then
// simply doesn't remember the sign-in between opens; it must not crash.
const store = {
  get: (k: string): string => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};

export const getToken = () => store.get(TOKEN);
export const setToken = (t: string) => store.set(TOKEN, t);
export const getCompanyId = () => store.get(COMPANY);
export const setCompanyId = (id: string) => store.set(COMPANY, id);
export function clearSession(): void { store.del(TOKEN); store.del(COMPANY); }

// A failed API call. `code` is what callers branch on; `message` is the server's own
// sentence and is safe to show as it is.
export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(humanize(message, status));
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// The session ended on the server's side (expired, suspended, permissions changed). There
// is no page to redirect to in a single-screen app, so whoever owns the session listens
// here and shows the sign-in screen.
type Listener = () => void;
const expiredListeners = new Set<Listener>();
export function onSessionExpired(fn: Listener): () => void {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = getCompanyId();
  if (company) headers["X-Company-ID"] = company;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json().catch(() => ({}));
  if (res.ok) return json.data as T;

  const said = json?.error?.message;
  const err = new ApiError(typeof said === "string" ? said : "", json?.error?.code, res.status);
  // A wrong password is a 401 too, but it is a form error, not an ended session.
  // Nor is Telegram failing to vouch for someone who isn't signed in yet.
  if (res.status === 401 && err.code !== "invalid_credentials" && err.code !== "invalid_telegram_data") {
    clearSession();
    expiredListeners.forEach((fn) => fn());
  }
  throw err;
}

// A list endpoint: rows plus the total across all pages (from the response's `meta`).
async function list<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<{ items: T[]; total: number }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = getCompanyId();
  if (company) headers["X-Company-ID"] = company;

  const res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ""}`, { headers });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const said = json?.error?.message;
    const err = new ApiError(typeof said === "string" ? said : "", json?.error?.code, res.status);
    if (res.status === 401) { clearSession(); expiredListeners.forEach((fn) => fn()); }
    throw err;
  }
  const items: T[] = Array.isArray(json.data) ? json.data : [];
  return { items, total: json.meta?.total ?? items.length };
}

export const api = {
  list,
  get:  <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put:  <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
