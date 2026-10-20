import { useState } from "react";

// "Which stretch of time?" on a phone: a short list of ready-made periods instead of the
// web's calendar. A period is the inclusive days it covers; All time has none.

export type PeriodId = "week" | "lastWeek" | "month" | "lastMonth" | "year" | "all";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "week", label: "This week" }, { id: "lastWeek", label: "Last week" },
  { id: "month", label: "This month" }, { id: "lastMonth", label: "Last month" },
  { id: "year", label: "This year" }, { id: "all", label: "All Time" },
];
export const periodLabel = (id: PeriodId) => PERIODS.find((p) => p.id === id)?.label ?? "";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The days a period covers, for a company whose work week starts on `weekStartDay` (0 = Sunday). */
export function periodRange(id: PeriodId, weekStartDay: number): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const weekStart = d - ((now.getDay() - weekStartDay + 7) % 7);
  const span = (a: Date, b: Date) => ({ from: iso(a), to: iso(b) });
  switch (id) {
    case "week":      return span(new Date(y, m, weekStart), new Date(y, m, weekStart + 6));
    case "lastWeek":  return span(new Date(y, m, weekStart - 7), new Date(y, m, weekStart - 1));
    case "month":     return span(new Date(y, m, 1), new Date(y, m + 1, 0));
    case "lastMonth": return span(new Date(y, m - 1, 1), new Date(y, m, 0));
    case "year":      return span(new Date(y, 0, 1), new Date(y, 11, 31));
    case "all":       return { from: "", to: "" };
  }
}

// The period in force is kept while the app is open, one per `scope`. Payouts and the KPI
// pages opened from it share a scope, so KPI opens on what Payouts was showing and coming
// back keeps it; the Dashboard has its own.
const chosen = new Map<string, PeriodId>();
export function usePeriod(scope: string): [PeriodId, (id: PeriodId) => void] {
  const [id, setId] = useState<PeriodId>(chosen.get(scope) ?? "week");
  return [id, (next) => { chosen.set(scope, next); setId(next); }];
}
