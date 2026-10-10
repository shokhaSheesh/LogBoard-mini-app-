import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api, getCompanyId, getToken } from "./api";
import { driverDisplayName } from "./driverName";
import { friendlyError } from "./errors";
import type { Status } from "./statuses";

// Gross: what every driver brought in, day by day, for one work week. The server owns the
// arithmetic (totals, driver pay, company profit, rate per mile) and the week's edges;
// this file only reads them and saves a changed day.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** One driver's day: money from loads, a status (Rest, Shop, …), or nothing. */
export interface DayCell {
  type: Status | "load" | "empty";
  amount: number;
  /** The load numbers the money belongs to. */
  loads: string[];
}

export interface GrossDriver {
  id: string;
  name: string;
  type: string;
  unit: string;
  /** Set (YYYY-MM-DD) for a driver who has since been removed: history, not editable. */
  removedOn: string;
  target: number;
  total: number;
  driverPay: number;
  profit: number;
  miles: number;
  rpm: number;
  days: Record<string, DayCell>;
}

export interface GrossWeek {
  from: string;
  to: string;
  weekStartDay: number;
  drivers: GrossDriver[];
}

export const EMPTY_DAY: DayCell = { type: "empty", amount: 0, loads: [] };

function toCell(c: Raw): DayCell {
  const refs = Array.isArray(c?.load_id) ? c.load_id : c?.load_id != null ? String(c.load_id).split("/") : [];
  return { type: c?.type ?? "empty", amount: c?.amount ?? 0, loads: refs.map((r: unknown) => String(r).trim()).filter(Boolean) };
}

function toDriver(d: Raw): GrossDriver {
  const days: Record<string, DayCell> = {};
  for (const [date, c] of Object.entries(d.days ?? {})) days[date] = toCell(c);
  return {
    id: d.driver_id, name: driverDisplayName(d), type: d.driver_type ?? "", unit: d.unit ?? "",
    removedOn: d.removed_on ?? "", target: d.weekly_target ?? 0, total: d.week_total ?? 0,
    driverPay: d.driver_pay ?? 0, profit: d.company_profit ?? 0, miles: d.miles ?? 0, rpm: d.rpm ?? 0, days,
  };
}

/** The week's matrix. With no dates the server answers with the current work week. */
export async function getGross(from?: string, to?: string): Promise<GrossWeek> {
  const d = await api.get<Raw>(`/gross${from && to ? `?from=${from}&to=${to}` : ""}`);
  return { from: d?.from ?? "", to: d?.to ?? "", weekStartDay: d?.week_start_day ?? 1, drivers: (d?.drivers ?? []).map(toDriver) };
}

// The headline numbers are the rows added up, as on the web: the server's own `totals`
// leave out days entered by hand, and would disagree with the list under them.
export function sumDrivers(list: GrossDriver[]) {
  const sum = (pick: (d: GrossDriver) => number) => list.reduce((n, d) => n + pick(d), 0);
  const total = sum((d) => d.total), miles = sum((d) => d.miles);
  return { total, driverPay: sum((d) => d.driverPay), profit: sum((d) => d.profit), miles, rpm: miles > 0 ? total / miles : 0 };
}

/** Saves one day. An "empty" cell clears it. */
export const saveDay = (driverId: string, date: string, cell: DayCell) =>
  api.patch("/gross", {
    driver_id: driverId, date, type: cell.type,
    amount: cell.type === "load" ? cell.amount : undefined,
    load_id: cell.type === "load" ? cell.loads.join("/") || undefined : undefined,
  });

/** A driver's loads, to tick the ones a day's money belongs to. */
export interface LoadPick { ref: string; payout: number; route: string }
export async function driverLoads(driverId: string, q: string): Promise<LoadPick[]> {
  const { items } = await api.list<Raw>("/loads", { driver_id: driverId, q: q || undefined, page: 1, page_size: 30 });
  const place = (s: Raw) => [s?.city, s?.state].filter(Boolean).join(", ");
  return items.map((l) => {
    const stops: Raw[] = Array.isArray(l.stops) ? l.stops : [];
    const a = stops.length > 1 ? place(stops[0]) : "", b = stops.length > 1 ? place(stops[stops.length - 1]) : "";
    return { ref: String(l.load_id ?? l.id), payout: l.payout ?? 0, route: a && b ? `${a} → ${b}` : "" };
  });
}

// ─── Days ─────────────────────────────────────────────────────────────────────

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/** The same day `n` days away. */
export function addDays(date: string, n: number): string {
  const d = day(date);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** Every day from `from` to `to`, a week at most. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; from && to && d <= to && out.length < 7; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (date: string) => WEEKDAYS[day(date).getDay()];

// ─── The week on screen ───────────────────────────────────────────────────────

// Weeks already fetched, kept for as long as the app is open. Going into a driver and back,
// or returning to a week seen a moment ago, shows what is here at once instead of asking
// the server again; an answer older than FRESH_MS is still shown at once, and replaced
// quietly when the new one arrives. In memory only: money figures are not left behind in
// the phone's storage, and a new sign-in or company starts clean (both are in the key).
const FRESH_MS = 30_000;
const seen = new Map<string, { week: GrossWeek; at: number }>();
/** Drops the weeks kept here — for a refresh the person asked for. */
export const forgetGrossWeeks = () => seen.clear();
const keyOf = (from: string, to: string) => `${getToken()}|${getCompanyId()}|${from}|${to}`;
function remember(from: string, to: string, week: GrossWeek) {
  const entry = { week, at: Date.now() };
  seen.set(keyOf(from, to), entry);
  // "The current week" (no dates) and the same week by its dates are one answer, so a
  // newer copy of either replaces both.
  if (!from && week.from) seen.set(keyOf(week.from, week.to), entry);
  if (from && seen.get(keyOf("", ""))?.week.from === week.from) seen.set(keyOf("", ""), entry);
}

// The week lives in the address (?from=&to=), so opening a driver and coming back stays on
// the same week. No dates means the current week, whose edges the server decides.
export function useGrossWeek() {
  const [params, setParams] = useSearchParams();
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  const key = keyOf(from, to);
  const [week, setWeek] = useState<GrossWeek | null>(() => seen.get(key)?.week ?? null);
  const [loading, setLoading] = useState(!seen.has(key));
  const [error, setError] = useState("");
  const req = useRef(0);

  // Only the latest request may write: tapping through weeks can outrun the server.
  // `force` asks the server even when the answer in hand is fresh (after a save).
  const load = useCallback((force = false) => {
    const id = ++req.current;
    const hit = seen.get(key);
    if (hit) {
      setWeek(hit.week); setError(""); setLoading(false);
      if (!force && Date.now() - hit.at < FRESH_MS) return Promise.resolve();
    } else {
      setLoading(true); setError("");
    }
    return getGross(from, to)
      .then((w) => { remember(from, to, w); if (id === req.current) setWeek(w); })
      // A failed quiet refresh leaves what is on screen alone.
      .catch((e) => { if (id === req.current && !hit) setError(friendlyError(e, "Couldn't load gross. Try again.")); })
      .finally(() => { if (id === req.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { void load(); }, [load]);

  const go = (f: string, t: string) => setParams(f && t ? { from: f, to: t } : {}, { replace: true });
  return {
    week, loading, error,
    /** "?from=…&to=…" for links that should stay on this week. */
    query: from && to ? `?from=${from}&to=${to}` : "",
    onCurrent: !from,
    shift: (dir: -1 | 1) => { if (week?.from) go(addDays(week.from, dir * 7), addDays(week.to, dir * 7)); },
    current: () => go("", ""),
    refresh: () => load(true),
  };
}
