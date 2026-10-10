// A thin, safe wrapper over Telegram's bridge (window.Telegram.WebApp).
//
// Everything is optional: opened in a plain browser — during development, or if someone
// pastes the URL — the bridge isn't there, and each helper quietly does nothing. The app
// must work either way.

interface TgWebApp {
  ready(): void;
  expand(): void;
  colorScheme?: "light" | "dark";
  initData?: string;
  onEvent(event: string, cb: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "success" | "warning" | "error"): void;
    selectionChanged(): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  disableVerticalSwipes?: () => void;
}

const tg: TgWebApp | undefined = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

/** True when the page is really running inside Telegram (not just with the script loaded). */
export const inTelegram = !!tg?.initData;

/** Telegram's signed note of who opened the app. The API checks the signature; we only carry it. */
export const launchData: string = tg?.initData ?? "";

// Light or dark, from Telegram when it is there, otherwise from the device.
function scheme(): "light" | "dark" {
  if (inTelegram && tg?.colorScheme) return tg.colorScheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
const applyScheme = () => { document.documentElement.dataset.scheme = scheme(); };

/** Call once, before the first render. */
export function initTelegram(): void {
  applyScheme();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", applyScheme);
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();                    // open full height rather than as a half sheet
    tg.disableVerticalSwipes?.();   // a downward scroll must not drag the app closed
    tg.onEvent("themeChanged", applyScheme);
  } catch { /* an older Telegram without one of these — nothing to do */ }
}

/** A small tap you can feel, for the moments that deserve one. */
export const haptic = {
  tap:     () => { try { tg?.HapticFeedback?.selectionChanged(); } catch { /* unsupported */ } },
  success: () => { try { tg?.HapticFeedback?.notificationOccurred("success"); } catch { /* unsupported */ } },
  error:   () => { try { tg?.HapticFeedback?.notificationOccurred("error"); } catch { /* unsupported */ } },
};
