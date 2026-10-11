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
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
}

const tg: TgWebApp | undefined = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

/** True when the page is really running inside Telegram (not just with the script loaded). */
export const inTelegram = !!tg?.initData;

/** Telegram's signed note of who opened the app. The API checks the signature; we only carry it. */
export const launchData: string = tg?.initData ?? "";

// ─── Light or dark ────────────────────────────────────────────────────────────
//
// The app is light or dark by the user's own choice, made in Profile and remembered on this
// phone. Until they choose, it opens the way their Telegram looks (or their device, outside
// Telegram). The colours themselves are ours in both modes — see theme.css.

export type Scheme = "light" | "dark";

const SCHEME_KEY = "brelo.scheme";
// The page colour of each mode (theme.css --surface), for Telegram's own bars around the app.
const PAGE: Record<Scheme, string> = { light: "#F4F6F5", dark: "#101613" };

// What the user picked, if they have. It is read from storage once; storage can be
// unavailable (a private window, a locked-down webview), and the choice then lasts until
// the app is closed rather than not at all.
let picked: Scheme | null = (() => {
  try {
    const v = localStorage.getItem(SCHEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch { return null; }
})();

function ambient(): Scheme {
  if (inTelegram && tg?.colorScheme) return tg.colorScheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The mode in force. */
export const currentScheme = (): Scheme => picked ?? ambient();

const watchers = new Set<() => void>();

function applyScheme(): void {
  const scheme = currentScheme();
  document.documentElement.dataset.scheme = scheme;
  // Telegram draws a bar above the app and, on some phones, one below. Left alone they keep
  // Telegram's own theme, which is the wrong colour the moment the user picks the other mode.
  try {
    tg?.setHeaderColor?.(PAGE[scheme]);
    tg?.setBackgroundColor?.(PAGE[scheme]);
    tg?.setBottomBarColor?.(PAGE[scheme]);
  } catch { /* an older Telegram without these — the bars keep its theme */ }
  watchers.forEach((w) => w());
}

/** Switch the app to light or dark, and remember it on this phone. */
export function setScheme(scheme: Scheme): void {
  picked = scheme;
  try { localStorage.setItem(SCHEME_KEY, scheme); } catch { /* not remembered past this visit */ }
  applyScheme();
}

/** Be told when the mode changes. Returns the way to stop. */
export function onScheme(cb: () => void): () => void {
  watchers.add(cb);
  return () => { watchers.delete(cb); };
}

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
