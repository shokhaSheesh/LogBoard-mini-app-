import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshAll } from "../lib/refresh";
import { haptic } from "../lib/telegram";

const TRIGGER = 64;   // how far the finger must pull, in px on screen
const MAX = 96;

// Pull down at the top of a screen to read it again. One of these sits at the app's root
// and listens everywhere, so every list and page gets it without each wiring it up.
//
// It stays out of the way of a form being filled in (starting the screen over would empty
// it), of an open sheet, and of sideways gestures such as the chip rows and the slider.
export function PullToRefresh() {
  const [pull, setPull]   = useState(0);       // how far the indicator is drawn down
  const [busy, setBusy]   = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const armed = useRef(false);
  const live  = useRef({ pull: 0, busy: false });
  live.current = { pull, busy };

  useEffect(() => {
    const scroller = (el: EventTarget | null) => (el instanceof Element ? el.closest(".scroll, .page-body") : null);
    const allowed = (target: EventTarget | null) => {
      if (live.current.busy || document.querySelector(".sheet-root")) return false;
      if (/\/(new|edit)$/.test(location.pathname)) return false;
      if (target instanceof Element && target.closest(".slide, input, textarea")) return false;
      const s = scroller(target);
      return !!s && s.scrollTop <= 0;
    };

    const down = (e: TouchEvent) => {
      start.current = e.touches.length === 1 && allowed(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      armed.current = false;
    };
    const move = (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.touches[0].clientX - start.current.x, dy = e.touches[0].clientY - start.current.y;
      // Sideways, upward, or the list has since scrolled: this was never a pull.
      if (dy <= 0 || Math.abs(dx) > dy || (scroller(e.target)?.scrollTop ?? 0) > 0) { start.current = null; setPull(0); return; }
      const drawn = Math.min(MAX, dy * 0.5);   // the indicator trails the finger
      if (drawn >= TRIGGER && !armed.current) { armed.current = true; haptic.tap(); }
      if (drawn < TRIGGER) armed.current = false;
      setPull(drawn);
    };
    const up = () => {
      if (!start.current) return;
      start.current = null;
      if (live.current.pull >= TRIGGER) {
        setBusy(true); setPull(TRIGGER);
        refreshAll().finally(() => { setBusy(false); setPull(0); });
      } else setPull(0);
    };

    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up);
    document.addEventListener("touchcancel", up);
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", up);
    };
  }, []);

  if (pull === 0 && !busy) return null;
  const ready = pull >= TRIGGER;
  return (
    <div className={`ptr ${busy ? "busy" : ""}`} role="status" aria-label={busy ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
      style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }}>
      <RefreshCw size={18} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, color: ready ? "var(--pine)" : undefined }} />
    </div>
  );
}
