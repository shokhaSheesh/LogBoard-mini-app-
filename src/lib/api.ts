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

// How many requests are out right now. Pull-to-refresh watches this to know when the
// screen it refreshed has finished loading.
let inFlight = 0;
const idleWaiters = new Set<() => void>();
function tracked<T>(work: Promise<T>): Promise<T> {
  inFlight++;
  return work.finally(() => { if (--inFlight === 0) { idleWaiters.forEach((fn) => fn()); idleWaiters.clear(); } });
}
/** Resolves once nothing is being fetched. */
export const whenIdle = (): Promise<void> => (inFlight === 0 ? Promise.resolve() : new Promise((done) => idleWaiters.add(done)));

// `asCompany` sends the request for that company instead of the active one, for a lookup
// that has to find which of the user's companies something belongs to.
async function request<T>(method: string, path: string, body?: unknown, form?: FormData, asCompany?: string): Promise<T> {
  // A file goes as a form, and the browser writes that Content-Type itself (it carries the
  // boundary between the parts).
  const headers: Record<string, string> = form ? {} : { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = asCompany ?? getCompanyId();
  if (company) headers["X-Company-ID"] = company;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
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

// A list endpoint: rows plus the total across all pages (from the response's `meta`), and
// the sums over everything the filters match, for the lists that send them (`totals`).
async function list<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<{ items: T[]; total: number; totals: Record<string, number> }> {
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
  return { items, total: json.meta?.total ?? items.length, totals: json.totals ?? {} };
}

// A file the server streams behind the same sign-in as everything else (an invoice PDF).
// A plain link can't carry the token, so it is fetched here and handed over as a blob.
async function blob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const company = getCompanyId();
  if (company) headers["X-Company-ID"] = company;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json().catch(() => ({}));
    const said = json?.error?.message;
    throw new ApiError(typeof said === "string" ? said : "", json?.error?.code, res.status);
  }
  return res.blob();
}

const upload = <T>(path: string, file: File): Promise<T> => {
  const form = new FormData();
  form.append("file", file);
  return request<T>("POST", path, undefined, form);
};

export const api = {
  list:  <T>(path: string, params?: Record<string, string | number | undefined>) => tracked(list<T>(path, params)),
  blob:  (path: string) => tracked(blob(path)),
  get:   <T>(path: string) => tracked(request<T>("GET", path)),
  /** A read made for a company other than the active one. */
  getAs: <T>(path: string, companyId: string) => tracked(request<T>("GET", path, undefined, undefined, companyId)),
  post:  <T>(path: string, body?: unknown) => tracked(request<T>("POST", path, body)),
  put:   <T>(path: string, body?: unknown) => tracked(request<T>("PUT", path, body)),
  patch: <T>(path: string, body?: unknown) => tracked(request<T>("PATCH", path, body)),
  delete: <T>(path: string, body?: unknown) => tracked(request<T>("DELETE", path, body)),
  /** Sends one file as a form (field "file"). */
  upload: <T>(path: string, file: File) => tracked(upload<T>(path, file)),
};
