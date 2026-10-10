import { api } from "./api";
import { remembered } from "./cache";
import { fmtDateRange } from "./dates";
import type { PeriodId } from "./period";

// The Dashboard's numbers for one period. The server does all the counting; this file asks
// for a period and shapes the answer for the screen.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export interface Ranked { name: string; value: number; note: string }

export interface Dashboard {
  /** The days actually covered, as the server reports them. */
  from: string;
  to: string;
  loads: number;
  gross: number;
  dispatcherPayout: number;
  /** Percent change against the stretch before; null when there is nothing to compare with. */
  loadsDelta: number | null;
  grossDelta: number | null;
  driversByGross: Ranked[];
  driversByRpm: Ranked[];
  dispatchers: Ranked[];
  pickupStates: Ranked[];
  deliveryStates: Ranked[];
  topLoads: Ranked[];
  /** One entry per day, quiet days included as zeros. */
  daily: { date: string; gross: number; loads: number }[];
}

const nLoads = (n: number) => `${n} ${n === 1 ? "load" : "loads"}`;
const nMiles = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;

function toDashboard(b: Raw): Dashboard {
  const list = (rows: Raw, shape: (r: Raw) => Ranked): Ranked[] => (Array.isArray(rows) ? rows.map(shape) : []);
  return {
    from: b?.period?.start ?? b?.week?.start ?? "", to: b?.period?.end ?? b?.week?.end ?? "",
    loads: b?.kpis?.completed_loads?.value ?? 0, gross: b?.kpis?.total_gross?.value ?? 0,
    dispatcherPayout: b?.dispatcher_payout ?? 0,
    loadsDelta: b?.kpis?.completed_loads?.delta_pct ?? null, grossDelta: b?.kpis?.total_gross?.delta_pct ?? null,
    driversByGross: list(b?.top_drivers_by_gross, (d) => ({ name: d.name, value: d.gross ?? 0, note: nLoads(d.loads ?? 0) })),
    driversByRpm:   list(b?.top_drivers_by_rpm, (d) => ({ name: d.name, value: d.rpm ?? 0, note: nMiles(d.miles ?? 0) })),
    dispatchers:    list(b?.top_dispatchers, (d) => ({ name: d.name, value: d.payout ?? 0, note: nLoads(d.loads ?? 0) })),
    pickupStates:   list(b?.top_pickup_states, (s) => ({ name: s.state, value: s.gross ?? 0, note: nLoads(s.loads ?? 0) })),
    deliveryStates: list(b?.top_delivery_states, (s) => ({ name: s.state, value: s.gross ?? 0, note: nLoads(s.loads ?? 0) })),
    // Broker first, then the load number — the way a load is named everywhere else.
    topLoads: list(b?.top_loads, (l) => ({
      name: [l.broker, l.load_ref || "Load"].filter(Boolean).join(" - "), value: l.gross ?? 0,
      note: [l.driver, l.miles > 0 ? nMiles(l.miles) : ""].filter(Boolean).join(" · "),
    })),
    daily: list(b?.daily, (d) => d).map((d: Raw) => ({ date: d.date, gross: d.gross ?? 0, loads: d.completed_loads ?? 0 })),
  };
}

// "This week" is asked for with no dates at all: the server decides which week that is, in
// the company's own timezone and work-week, rather than this phone's clock.
export function getDashboard(period: PeriodId, range: { from: string; to: string }): Promise<Dashboard> {
  const query = period === "week" ? "" : period === "all" ? "?period=all" : period === "lastWeek" ? `?week=${range.from}` : `?period=range&from=${range.from}&to=${range.to}`;
  return remembered(`dashboard|${query}`, async () => toDashboard(await api.get<Raw>(`/dashboard${query}`)));
}

// ─── The chart's bars ─────────────────────────────────────────────────────────

export interface Point { label: string; tip: string; gross: number; loads: number }

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayOf = (date: string) => { const [y, m, d] = date.split("-").map(Number); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; };

// A bar per day up to a month; beyond that the days are gathered into weeks, and beyond
// about four months into calendar months — a phone has room for a few dozen bars at most.
export function toSeries(daily: Dashboard["daily"]): { unit: "day" | "week" | "month"; points: Point[] } {
  const n = daily.length;
  if (n <= 31) {
    return { unit: "day", points: daily.map((d) => ({
      label: n <= 7 ? weekdayOf(d.date) : d.date.slice(8, 10),
      tip: `${weekdayOf(d.date)} ${fmtDateRange(d.date, d.date)}`, gross: d.gross, loads: d.loads,
    })) };
  }
  const byMonth = n > 120;
  const groups = new Map<string, { first: string; last: string; gross: number; loads: number }>();
  daily.forEach((d, i) => {
    const key = byMonth ? d.date.slice(0, 7) : String(Math.floor(i / 7));
    const g = groups.get(key) ?? { first: d.date, last: d.date, gross: 0, loads: 0 };
    g.last = d.date; g.gross += d.gross; g.loads += d.loads;
    groups.set(key, g);
  });
  const manyYears = daily[0].date.slice(0, 4) !== daily[n - 1].date.slice(0, 4);
  return {
    unit: byMonth ? "month" : "week",
    points: [...groups.values()].map((g) => ({
      label: byMonth ? `${MONTHS[Number(g.first.slice(5, 7)) - 1]}${manyYears ? ` ${g.first.slice(2, 4)}` : ""}` : `${g.first.slice(8, 10)}.${g.first.slice(5, 7)}`,
      tip: fmtDateRange(g.first, g.last), gross: g.gross, loads: g.loads,
    })),
  };
}
