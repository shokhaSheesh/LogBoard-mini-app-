// ─── One date format ──────────────────────────────────────────────────────────
//
// Every date the app shows is written the same way, day first:
//
//   DD.MM.YY                 a day                    08.10.26   (8 October 2026)
//   DD.MM-DD.MM.YY           a range of days          05.10-11.10.26
//   DD.MM.YY-DD.MM.YY        a range across a year    29.12.26-04.01.27
//   DD.MM.YY · HH:MM         a day and a time         08.10.26 · 14:20
//
// Appointments (free text on the backend) get the same shape from lib/appt.

type DateLike = Date | string | number | null | undefined;

const pad2 = (n: number) => String(n).padStart(2, "0");

// A bare "YYYY-MM-DD" is a calendar day, not an instant: new Date("2026-11-02") is UTC
// midnight, which prints as the day before west of Greenwich. Read those as local days.
function toDate(v: DateLike): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Day first, then month — DD.MM.
const dm = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
const yy = (d: Date) => pad2(d.getFullYear() % 100);

// "08.10.26" — or "" when there's no (readable) date, so callers pick their own blank.
export function fmtDate(v: DateLike): string {
  const d = toDate(v);
  return d ? `${dm(d)}.${yy(d)}` : "";
}

// "05.10-11.10.26"; one day when both ends are the same.
export function fmtDateRange(from: DateLike, to: DateLike): string {
  const a = toDate(from), b = toDate(to);
  if (!a || !b) return fmtDate(a ?? b);
  if (a.getFullYear() !== b.getFullYear()) return `${fmtDate(a)}-${fmtDate(b)}`;
  if (a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return fmtDate(a);
  return `${dm(a)}-${dm(b)}.${yy(b)}`;
}

// "08.10.26 · 14:20" — the same 24-hour clock appointments use.
export function fmtDateTime(v: DateLike): string {
  const d = toDate(v);
  return d ? `${fmtDate(d)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "";
}
