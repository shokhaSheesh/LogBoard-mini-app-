import { useSyncExternalStore } from "react";
import { whenIdle } from "./api";
import { forgetAll } from "./cache";
import { forgetGrossWeeks } from "./gross";

// "Show me this again, fresh." Everything kept in memory is dropped and the screen on show
// is started over, so it reads from the server as if just opened. The screen's own place —
// its filter, its week, its period — lives outside it and survives.

let round = 0;
const listeners = new Set<() => void>();

/** Starts the refresh and resolves when the refreshed screen has finished loading. */
export async function refreshAll(): Promise<void> {
  forgetAll();
  forgetGrossWeeks();
  round++;
  listeners.forEach((fn) => fn());
  // Give the fresh screen a moment to send its requests, then wait for them. The pause
  // also keeps the spinner up long enough to be seen when the answer is instant.
  await new Promise((r) => setTimeout(r, 450));
  await whenIdle();
}

/** A number that changes on every refresh; used as a `key` it starts a screen over. */
export function useRefreshRound(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => round);
}
