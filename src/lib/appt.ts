// Label words / placeholders that sometimes end up stored as an appointment value — the
// AI extractor copies a rate con's section HEADING ("Appointment", "TBD", "N/A") when
// the document states no actual time, and those got saved verbatim. They mean "no
// appointment", so they render (and re-save) as empty. Real free-text values
// ("FCFS", "07/06 0800-1700") pass through untouched.
const APPT_JUNK = new Set([
  "appointment", "appt", "appt time", "appointment time",
  "tbd", "tba", "n/a", "na", "none", "null", "-", "—",
]);

export function cleanAppt(raw?: string): string {
  const v = (raw ?? "").trim();
  return APPT_JUNK.has(v.toLowerCase().replace(/[.:]+$/, "")) ? "" : v;
}

// ─── One appointment format ───────────────────────────────────────────────────
//
// `appt` is free text on the backend, and it arrives in several shapes: the load form used
// to write "07/15 · 08:00", the AI extractor copies a rate con verbatim ("07/20/2026 0800 -
// 1200"), people type their own. Everything the app SHOWS and everything the form SAVES
// goes through here, so it all reads the same way:
//
//   DD.MM.YY · HH:MM                a date and a time
//   DD.MM.YY · HH:MM-HH:MM          a date and a time window
//   DD.MM-DD.MM.YY · HH:MM-HH:MM    a date range (the year is written once when both
//                                   days share it) and a time window
//
// The date part is the app-wide date format (see lib/dates): day first, with dots.
//
// Reading goes by the separator, because that is what tells the two orders apart:
//   · dots    → day first   ("20.07.26")  — what this app writes
//   · slashes → month first ("07/20/2026") — how US rate confirmations and older loads
//               write it; they are read as such and come out day-first with dots.
//
// Text that isn't a date or a time at all ("FCFS", "Call for appt") is kept as written.

export interface ApptParts {
  y: number | null;   // full year; null when the text didn't state one
  mo: number | null;  // 0-based month
  d: number | null;
  // The last day of a date range; all null for a single day.
  y2: number | null;
  mo2: number | null;
  d2: number | null;
  from: string;       // "HH:MM", or ""
  to: string;         // "HH:MM" — the end of a window, or ""
  note: string;       // the original text, when it couldn't be read as date/time
}

export const EMPTY_APPT: ApptParts = { y: null, mo: null, d: null, y2: null, mo2: null, d2: null, from: "", to: "", note: "" };
const pad2 = (n: number) => String(n).padStart(2, "0");

// "8", "800", "0800", "8:00", "8.30" → "08:00" / "08:30"; anything else → "".
export function normalizeTime(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits || digits.length > 4) return "";
  const h = digits.length <= 2 ? Number(digits) : Number(digits.slice(0, digits.length - 2));
  const m = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  return h < 24 && m < 60 ? `${pad2(h)}:${pad2(m)}` : "";
}

// A date: slashed and month-first ("7/15", "07/15/2026"), or dotted and day-first
// ("15.07.26") — and the first half of a dotted range ("15.07" in "15.07-17.07.26"). A
// dotted pair on its own is NOT a date: "8.30" is a time.
const DATE_RE = /(?<![\d/.])(?:(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?|(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})|(\d{1,2})\.(\d{1,2})(?=\s*[-–]\s*\d{1,2}\.\d{1,2}\.\d{2,4}))(?![\d/.])/g;
// A time token: "14:00", "0800", "8:30 AM", "5pm". Bare one- or two-digit numbers only
// count when a meridiem follows ("5pm") — otherwise "07/06 2 pallets" would read as 02:00.
const TIME_RE = /(?<![\d/])(\d{1,2})(?::?(\d{2}))?\s*([ap])\.?m\.?(?![a-z])|(?<![\d/])(\d{1,2}):?(\d{2})(?![\d/])/gi;

const fullYear = (raw?: string) => (raw ? (raw.length === 2 ? 2000 + Number(raw) : Number(raw)) : null);

export function parseAppt(raw?: string): ApptParts {
  const text = cleanAppt(raw);
  if (!text) return EMPTY_APPT;

  // Up to two dates: a day, or the first and last day of a range.
  const found: { mo: number; d: number; y: number | null }[] = [];
  let rest = text.replace(DATE_RE, (m, sm, sd, sy, dd, dm, dy, rd, rm) => {
    // Slashes: month/day. Dots: day.month — unless that can't be a date and the other
    // order can ("07.20.26"), which is a month-first value from before the format changed.
    let mo = sm, d = sd;
    if (sm === undefined) {
      const first = dd ?? rd, second = dm ?? rm;
      const dayFirst = !(parseInt(second, 10) > 12 && parseInt(first, 10) <= 12);
      d = dayFirst ? first : second;
      mo = dayFirst ? second : first;
    }
    const y = sy ?? dy;
    const mi = parseInt(mo, 10) - 1, di = parseInt(d, 10);
    if (found.length >= 2 || mi < 0 || mi > 11 || di < 1 || di > 31) return m;
    found.push({ mo: mi, d: di, y: fullYear(y) });
    return " ";
  });

  const times: string[] = [];
  rest = rest.replace(TIME_RE, (m, h12, m12, mer, h24, m24) => {
    let t = "";
    if (mer) {
      let h = Number(h12) % 12;
      if (String(mer).toLowerCase() === "p") h += 12;
      const mi = m12 ? Number(m12) : 0;
      if (Number(h12) >= 1 && Number(h12) <= 12 && mi < 60) t = `${pad2(h)}:${pad2(mi)}`;
    } else {
      t = normalizeTime(`${h24}${m24}`);
    }
    if (!t || times.length >= 2) return m;
    times.push(t);
    return " ";
  });

  // Anything left besides separators is wording we can't express ("FCFS", "dock 4") —
  // rewriting the value would lose it, so the text stays exactly as it was.
  const leftover = rest.replace(/[\s·•\-–—,;@|()]|to|from|between|and/gi, "");
  if (leftover || (found.length === 0 && times.length === 0)) return { ...EMPTY_APPT, note: text };

  const [a, b] = found;
  // "07/20-07/22/26" states the year once — it belongs to both days.
  const ya = a ? a.y ?? b?.y ?? null : null;
  const yb = b ? b.y ?? a?.y ?? null : null;
  return {
    y: ya, mo: a?.mo ?? null, d: a?.d ?? null,
    y2: yb, mo2: b?.mo ?? null, d2: b?.d ?? null,
    from: times[0] ?? "", to: times[1] ?? "", note: "",
  };
}

export function formatApptParts(p: ApptParts): string {
  if (p.note) return p.note;
  // A date with no stated year is taken to be this year — the only thing it can mean when
  // it was typed, and what makes old "07/15 · 08:00" values line up with the new ones.
  const thisYear = new Date().getFullYear();
  const md = (mo: number, d: number) => `${pad2(d)}.${pad2(mo + 1)}`; // day first
  const yy = (y: number | null) => pad2((y ?? thisYear) % 100);
  let date = "";
  if (p.mo !== null && p.d !== null) {
    const sameDay = p.mo2 === p.mo && p.d2 === p.d && (p.y2 ?? p.y) === p.y;
    if (p.mo2 === null || p.d2 === null || sameDay) date = `${md(p.mo, p.d)}.${yy(p.y)}`;
    else if ((p.y ?? thisYear) === (p.y2 ?? p.y ?? thisYear)) date = `${md(p.mo, p.d)}-${md(p.mo2, p.d2)}.${yy(p.y)}`;
    else date = `${md(p.mo, p.d)}.${yy(p.y)}-${md(p.mo2, p.d2)}.${yy(p.y2)}`;
  }
  const from = p.from || p.to; // a lone "to" is just a time
  const time = from ? (p.from && p.to ? `${p.from}-${p.to}` : from) : "";
  return [date, time].filter(Boolean).join(" · ");
}

// Any appointment text → the one display format (or the text itself, when it's wording).
export function formatAppt(raw?: string): string {
  return formatApptParts(parseAppt(raw));
}
