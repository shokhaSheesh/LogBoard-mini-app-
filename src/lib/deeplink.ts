import { startParam } from "./telegram";

// The bot's "📱 Open in Brelo" buttons open the app at a draft it made from a rate
// confirmation, or at a load. They say which in one of two ways, depending on how the bot's
// mini app address is set (TELEGRAM_MINI_APP_URL, ADR 0035):
//
//   the app's own address        ?draft=<uuid>  or  ?load=<uuid>
//   a t.me/<bot>?startapp link   start_param "draft_<uuid>"  or  "load_<uuid>"
//
// Either is read once, when the app starts, and handed to whoever asks first.

export interface Target { kind: "draft" | "load"; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(): Target | null {
  try {
    const q = new URLSearchParams(window.location.search);
    for (const kind of ["draft", "load"] as const) {
      const id = q.get(kind);
      if (id && UUID.test(id)) return { kind, id };
    }
  } catch { /* no usable address — nothing asked for */ }
  const m = /^(draft|load)_(.+)$/.exec(startParam);
  return m && UUID.test(m[2]) ? { kind: m[1] as Target["kind"], id: m[2] } : null;
}

let pending = read();

/** What the app was opened to show, once: a second call gets null. */
export function takeTarget(): Target | null {
  const t = pending;
  pending = null;
  // Out of the address bar too, so a reload doesn't open it again.
  if (t && window.location.search) {
    try { window.history.replaceState(window.history.state, "", window.location.pathname); } catch { /* cosmetic */ }
  }
  return t;
}
