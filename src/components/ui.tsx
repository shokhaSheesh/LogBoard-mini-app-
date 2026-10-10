import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { STATUS_CONFIG, type Status } from "../lib/statuses";
import { haptic } from "../lib/telegram";

// The small shared pieces of the mini app: a status chip, a bottom sheet, the top bar of
// a full-screen page, and a toast.

// ─── Status ───────────────────────────────────────────────────────────────────

// A status as a soft chip: a light tint of its colour with the text in a deeper shade.
// The colours are the web's — a status looks the same everywhere.
export function statusColors(s: Status) {
  const c = STATUS_CONFIG[s]?.bg ?? "#94A3B8";
  return { dot: c, bg: `color-mix(in srgb, ${c} 16%, var(--card))`, color: `color-mix(in srgb, ${c} 55%, var(--ink))` };
}

export function StatusChip({ status, large, onClick, busy }: { status: Status; large?: boolean; onClick?: () => void; busy?: boolean }) {
  // A load waiting in a driver's queue has no status of its own yet.
  const label = STATUS_CONFIG[status]?.label ?? "Queued";
  const c = statusColors(status);
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap", borderRadius: 999,
    fontSize: large ? 13 : 11, fontWeight: 600, padding: large ? "6px 12px" : "3px 9px", color: c.color, background: c.bg,
  };
  const inner = <>
    {busy ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />}
    {label}{onClick && <span aria-hidden style={{ opacity: 0.7, fontSize: 10 }}>▾</span>}
  </>;
  return onClick
    ? <button style={style} onClick={onClick} disabled={busy} aria-label={`Status: ${label}. Change`}>{inner}</button>
    : <span style={style}>{inner}</span>;
}

// ─── Bottom sheet ─────────────────────────────────────────────────────────────

// Slides up over the page. Tapping outside closes it; `tall` lets it take most of the
// screen (forms with a keyboard), otherwise it is as tall as its content.
export function Sheet({ title, onClose, children, tall }: { title?: string; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" style={tall ? { height: "88%" } : undefined}>
        <div className="sheet-grab" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** One tappable line in a sheet. */
export function SheetRow({ children, onClick, danger, selected, disabled }: { children: React.ReactNode; onClick: () => void; danger?: boolean; selected?: boolean; disabled?: boolean }) {
  return (
    <button className="sheet-row" onClick={() => { haptic.tap(); onClick(); }} disabled={disabled}
      style={{ color: danger ? "var(--danger)" : undefined, fontWeight: selected ? 600 : undefined }}>
      {children}
    </button>
  );
}

// ─── Top bar of a full-screen page ────────────────────────────────────────────

export function TopBar({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={onBack} aria-label="Back"><ChevronLeft size={20} /></button>
      <div className="ell" style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 600 }}>{title}</div>
      <div style={{ width: 38, display: "flex", justifyContent: "flex-end" }}>{right}</div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastMsg = { text: string; kind: "ok" | "error"; id: number };
let push: ((t: ToastMsg) => void) | null = null;
let seq = 0;

/** A short confirmation at the top of the screen. */
export const toast = {
  ok:    (text: string) => { haptic.success(); push?.({ text, kind: "ok", id: ++seq }); },
  error: (text: string) => { haptic.error();   push?.({ text, kind: "error", id: ++seq }); },
};

/** Mounted once at the app root. */
export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => { push = setMsg; return () => { push = null; }; }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.kind === "error" ? 4500 : 2200);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return createPortal(
    <div className="toast" role="status" style={msg.kind === "error" ? { background: "var(--danger)" } : undefined} onClick={() => setMsg(null)}>{msg.text}</div>,
    document.body,
  );
}
