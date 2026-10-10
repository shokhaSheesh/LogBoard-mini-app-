import { useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDateRange } from "../lib/dates";
import { PERIODS, periodLabel, type PeriodId } from "../lib/period";
import { haptic } from "../lib/telegram";
import { Sheet, SheetRow } from "./ui";

// Pieces the Finance and Dashboard screens share: the week switcher, the block of headline
// numbers, the progress bar toward a target, and the chips that pick a period or a filter.

/** Dollars without cents for headline numbers; the sign survives ("-$50"). */
export const dollars = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
/** Short money for tight spots: "$48,200", then "$148k", "$1.25M". */
export function compact(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a < 100_000) return dollars(n);
  return a < 1_000_000 ? `${sign}$${Math.round(a / 1000)}k` : `${sign}$${(a / 1_000_000).toFixed(2)}M`;
}
export const perMile = (n: number) => `$${n.toFixed(2)}`;
/** Money to the cent, where cents are the point (a dispatcher's percent of a load). */
export const cents = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One week at a time. The label is the week itself; off the current week, tapping it
// comes back.
export function WeekBar({ from, to, onShift, onCurrent, isCurrent }: { from: string; to: string; onShift: (dir: -1 | 1) => void; onCurrent: () => void; isCurrent: boolean }) {
  return (
    <div className="weekbar">
      <button className="icon-btn" aria-label="Previous week" onClick={() => { haptic.tap(); onShift(-1); }}><ChevronLeft size={18} /></button>
      <button className="weekbar-label" onClick={onCurrent} disabled={isCurrent} aria-label={isCurrent ? undefined : "Back to this week"}>
        <b>{from ? fmtDateRange(from, to) : " "}</b>
        {!isCurrent && <span className="sub">This week</span>}
      </button>
      <button className="icon-btn" aria-label="Next week" onClick={() => { haptic.tap(); onShift(1); }}><ChevronRight size={18} /></button>
    </div>
  );
}

export interface KpiItem { label: string; value: string; bad?: boolean; /** A line under the number, e.g. the change against last week. */ note?: string; noteTone?: "good" | "bad" }

export function Kpis({ items, across = 2 }: { items: KpiItem[]; across?: 2 | 3 }) {
  return (
    <div className={`kpis ${across === 3 ? "three" : ""}`}>
      {items.map((k) => (
        <div key={k.label}>
          <small>{k.label}</small>
          <span style={k.bad ? { color: "var(--danger)" } : undefined}>{k.value}</span>
          {k.note && <em style={{ color: k.noteTone === "bad" ? "var(--danger)" : k.noteTone === "good" ? "var(--pine)" : undefined }}>{k.note}</em>}
        </div>
      ))}
    </div>
  );
}

/** How far along a target, 0–100. */
export const percentOf = (n: number, target: number) => (target > 0 ? Math.round((n / target) * 100) : 0);

export function Bar({ percent }: { percent: number }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>;
}

// A chip that names the choice in force and opens a sheet to change it. Filled when the
// choice narrows the list (`on`), outlined when it is the everything-option.
export function PickChip<T extends string>({ title, value, label, options, onPick, on }: {
  title: string; value: T; label: string; options: { id: T; label: string }[]; onPick: (id: T) => void; on?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`chip ${on ? "on" : ""}`} onClick={() => { haptic.tap(); setOpen(true); }} aria-haspopup="dialog" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span className="ell" style={{ maxWidth: 150 }}>{label}</span><ChevronDown size={13} />
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {options.map((o) => (
            <SheetRow key={o.id} selected={o.id === value} onClick={() => { onPick(o.id); setOpen(false); }}>
              <span className="ell" style={{ flex: 1 }}>{o.label}</span>
              {o.id === value && <Check size={18} style={{ color: "var(--pine)" }} />}
            </SheetRow>
          ))}
        </Sheet>
      )}
    </>
  );
}

export function PeriodChip({ value, onPick }: { value: PeriodId; onPick: (id: PeriodId) => void }) {
  return <PickChip title="Period" value={value} label={periodLabel(value)} options={PERIODS} onPick={onPick} on={value !== "all"} />;
}
