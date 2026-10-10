import { getCompanyId, getToken } from "./api";

// Answers kept for a short while, in memory. Moving between screens that ask the same
// question (a list, a page opened from it, back again) reuses the answer instead of asking
// the server each time. Nothing is written to the phone's storage, and the key carries the
// sign-in and the company, so a new session or another company starts clean.

const FRESH_MS = 30_000;
// `settled` is the last answer that actually arrived. It outlives its freshness: a screen
// can show it at once (see `peek`) while a newer one is on its way.
const kept = new Map<string, { at: number; value: Promise<unknown>; settled?: unknown }>();
const scoped = (key: string) => `${getToken()}|${getCompanyId()}|${key}`;

/** The answer to `key`: the one in hand if it is fresh, otherwise a new one from `ask`. */
export function remembered<T>(key: string, ask: () => Promise<T>): Promise<T> {
  const k = scoped(key);
  const hit = kept.get(k);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.value as Promise<T>;
  const value = ask();
  const entry = { at: Date.now(), value, settled: hit?.settled };
  kept.set(k, entry);
  value.then(
    (v) => { entry.settled = v; },
    // A failure is not an answer worth keeping; the older one, if any, stays to be shown.
    () => { if (kept.get(k) === entry) { if (hit?.settled !== undefined) kept.set(k, { at: 0, value: Promise.resolve(hit.settled), settled: hit.settled }); else kept.delete(k); } },
  );
  return value;
}

/** The last answer to `key` that arrived, however old — to show at once while asking again. */
export function peek<T>(key: string): T | undefined {
  return kept.get(scoped(key))?.settled as T | undefined;
}

/** Drops every kept answer whose key starts with `prefix` — after a change that makes them stale. */
export function forget(prefix: string): void {
  const p = scoped(prefix);
  for (const k of kept.keys()) if (k.startsWith(p)) kept.delete(k);
}

/** Drops everything kept — for a refresh the person asked for. */
export function forgetAll(): void { kept.clear(); }
