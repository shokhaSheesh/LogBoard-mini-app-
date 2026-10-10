import { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";
import { haptic } from "../lib/telegram";

// A track with a knob that is dragged to the far end to confirm — for an action that should
// not happen from a stray tap (signing out). When it appears the knob nudges to the right a
// couple of times, to show which way it goes. Enter or Space confirms from a keyboard.
export function SlideToConfirm({ label, icon, onConfirm, busy }: { label: string; icon: React.ReactNode; onConfirm: () => void; busy?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);            // how far the knob has been dragged, in px
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false); // the hint stops once it has been used
  const start = useRef(0);

  const room = () => Math.max(0, (track.current?.clientWidth ?? 0) - 52);
  const done = busy || (room() > 0 && x >= room());

  const down = (e: React.PointerEvent) => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = e.clientX - x;
    setDragging(true); setTouched(true);
  };
  const move = (e: React.PointerEvent) => { if (dragging) setX(Math.max(0, Math.min(room(), e.clientX - start.current))); };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    // Most of the way counts; anything less springs back.
    if (x >= room() * 0.85) { setX(room()); haptic.success(); onConfirm(); }
    else setX(0);
  };

  return (
    <div ref={track} className={`slide ${dragging ? "dragging" : ""} ${done ? "done" : ""}`}>
      <span className="slide-fill" style={{ width: x + 52 }} />
      <span className="slide-label" style={{ opacity: done ? 0 : Math.max(0, 1 - x / 120) }}>{label}<ChevronsRight size={16} /></span>
      <button className={`slide-knob ${touched || busy ? "" : "hint"}`} style={{ transform: `translateX(${busy ? room() : x}px)` }}
        role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={room() ? Math.round((x / room()) * 100) : 0} disabled={busy}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onConfirm(); } }}>
        {busy ? <span className="spinner" /> : icon}
      </button>
    </div>
  );
}
