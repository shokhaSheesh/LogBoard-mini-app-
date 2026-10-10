import { getCompanyId, getToken } from "./api";

// Answers kept for a short while, in memory. Moving between screens that ask the same
// question (a list, a page opened from it, back again) reuses the answer instead of asking
// the server each time. Nothing is written to the phone's storage, and the key carries the
// sign-in and the company, so a new session or another company starts clean.

const FRESH_MS = 30_000;
const kept = new Map<string, { at: number; value: Promise<unknown> }>();
const scoped = (key: string) => `${getToken()}|${getCompanyId()}|${key}`;

/** The answer to `key`: the one in hand if it is fresh, otherwise a new one from `ask`. */
export function remembered<T>(key: string, ask: () => Promise<T>): Promise<T> {
  const k = scoped(key);
  const hit = kept.get(k);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.value as Promise<T>;
  const value = ask();
  kept.set(k, { at: Date.now(), value });
  // A failure is not an answer worth keeping.
  value.catch(() => { if (kept.get(k)?.value === value) kept.delete(k); });
  return value;
}

/** Drops every kept answer whose key starts with `prefix` — after a change that makes them stale. */
export function forget(prefix: string): void {
  const p = scoped(prefix);
  for (const k of kept.keys()) if (k.startsWith(p)) kept.delete(k);
}
