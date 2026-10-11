import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { fmtDate } from "../lib/dates";
import { haptic } from "../lib/telegram";
import { Sheet } from "./ui";

// A day and a time of day, chosen rather than typed — and chosen in our own calendar and
// our own wheels, not the phone's. The phone's pickers look different on every device and
// in neither of our modes; these look like Brelo in both.
//
// The web lets a time be typed. On a phone, typing digits and a colon is the slow way; a
// time is picked.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // Sunday first, as on the web
const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };

// ─── A day ────────────────────────────────────────────────────────────────────

/** A day, as YYYY-MM-DD ("" for none). `min` greys out every day before it; `required` hides Clear. */
export function DateField({ value, onChange, label, min, required, placeholder = "Pick a date", style }: {
  value: string; onChange: (day: string) => void; label: string; min?: string; required?: boolean; placeholder?: string; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="picker" style={style} aria-label={value ? `${label}: ${fmtDate(value)}. Change` : label} aria-haspopup="dialog"
      onClick={() => { haptic.tap(); setOpen(true); }}>
      {value ? <span>{fmtDate(value)}</span> : <span className="ph">{placeholder}</span>}
      <CalendarDays size={17} />
    </button>
    {open && <CalendarSheet title={label} value={value} min={min} required={required}
      onPick={(day) => { onChange(day); setOpen(false); }} onClose={() => setOpen(false)} />}
  </>;
}

function CalendarSheet({ title, value, min, required, onPick, onClose }: {
  title: string; value: string; min?: string; required?: boolean; onPick: (day: string) => void; onClose: () => void;
}) {
  const today = todayIso();
  // Open on the month of the day in force; with none, on the first month a day can be picked in.
  const start = value || (min && min > today ? min : today);
  const [y, setY] = useState(Number(start.slice(0, 4)));
  const [m, setM] = useState(Number(start.slice(5, 7)) - 1);
  const step = (by: number) => { const d = new Date(y, m + by, 1); setY(d.getFullYear()); setM(d.getMonth()); haptic.tap(); };

  const lead = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  // No going back to a month that has no day left to pick.
  const canGoBack = !min || iso(y, m, 1) > min;
  const pick = (day: string) => { haptic.tap(); onPick(day); };

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="cal-head">
        <button type="button" className="icon-btn" onClick={() => step(-1)} disabled={!canGoBack} aria-label="Previous month" style={canGoBack ? undefined : { opacity: 0.35 }}><ChevronLeft size={18} /></button>
        <span aria-live="polite">{MONTHS[m]} {y}</span>
        <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="cal">
        {DAYS.map((d) => <i key={d}>{d}</i>)}
        {Array.from({ length: lead }, (_, i) => <span key={`lead${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const day = iso(y, m, i + 1);
          const cls = day === value ? "on" : day === today ? "today" : undefined;
          return <button type="button" key={day} className={cls} disabled={!!min && day < min} aria-pressed={day === value}
            aria-label={`${i + 1} ${MONTHS[m]} ${y}`} onClick={() => pick(day)}>{i + 1}</button>;
        })}
      </div>
      <div className="sheet-foot">
        {!required && <button type="button" className="btn ghost small" onClick={() => pick("")} disabled={!value}>Clear</button>}
        <button type="button" className="btn ghost small" onClick={() => pick(today)} disabled={!!min && today < min}>Today</button>
      </div>
    </Sheet>
  );
}

// ─── A time of day ────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ROW = 44; // one row of a wheel, in px — matches .wheel > button in theme.css

/** A time of day, as 24-hour HH:MM ("" for none). */
export function TimeField({ value, onChange, label, placeholder = "Pick a time" }: {
  value: string; onChange: (time: string) => void; label: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="picker" aria-label={value ? `${label}: ${value}. Change` : label} aria-haspopup="dialog"
      onClick={() => { haptic.tap(); setOpen(true); }}>
      {value ? <span>{value}</span> : <span className="ph">{placeholder}</span>}
      <Clock size={17} />
    </button>
    {open && <TimeSheet title={label} value={value}
      onDone={(t) => { onChange(t); setOpen(false); }} onClose={() => setOpen(false)} />}
  </>;
}

function TimeSheet({ title, value, onDone, onClose }: { title: string; value: string; onDone: (time: string) => void; onClose: () => void }) {
  // With no time yet the wheels open on 08:00 — the start of a working day, not midnight.
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  const [hour, setHour] = useState(m ? Math.min(23, Number(m[1])) : 8);
  const [minute, setMinute] = useState(m ? Math.min(59, Number(m[2])) : 0);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="wheels">
        <Wheel label="Hour" values={HOURS} value={hour} onChange={setHour} />
        <b aria-hidden>:</b>
        <Wheel label="Minute" values={MINUTES} value={minute} onChange={setMinute} />
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn ghost small" onClick={() => { haptic.tap(); onDone(""); }} disabled={!value}>Clear</button>
        <button type="button" className="btn small" onClick={() => { haptic.tap(); onDone(`${pad2(hour)}:${pad2(minute)}`); }}>Done</button>
      </div>
    </Sheet>
  );
}

// One column: it scrolls, and the row that comes to rest in the middle is the value.
// Tapping a row brings it to the middle.
function Wheel({ label, values, value, onChange }: { label: string; values: number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  // Put the value in force in the middle before the first paint, with no visible scroll.
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = values.indexOf(value) * ROW; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW)));
    if (values[i] !== value) { haptic.tap(); onChange(values[i]); }
    // Where scroll-snap is missing or cut short, finish the snap ourselves.
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => { if (Math.abs(el.scrollTop - i * ROW) > 1) el.scrollTo({ top: i * ROW, behavior: "smooth" }); }, 140);
  };

  return (
    <div className="wheel" ref={ref} onScroll={onScroll} role="listbox" aria-label={label} tabIndex={0}>
      {values.map((v, i) => (
        <button type="button" key={v} role="option" aria-selected={v === value} className={v === value ? "on" : undefined}
          onClick={() => ref.current?.scrollTo({ top: i * ROW, behavior: "smooth" })}>{pad2(v)}</button>
      ))}
    </div>
  );
}
