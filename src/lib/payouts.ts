import { api } from "./api";
import { forget, remembered } from "./cache";

// Payouts: one row per completed load — its rate, what was added or deducted afterwards,
// and the net. And dispatcher KPI: each dispatcher's percent of the loads they booked.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;
type Range = { from: string; to: string };

export interface Payout {
  id: string;
  loadRef: string;
  driver: string;
  broker: string;
  origin: string;
  destination: string;
  dispatcher: string;
  rate: number;
  added: number;
  deducted: number;
  net: number;
  notes: string;
  completedAt: string;
}

export interface PayoutTotals { rate: number; added: number; deducted: number; net: number }

const toPayout = (b: Raw): Payout => ({
  id: b.id, loadRef: b.load_ref ?? "", driver: b.driver_name ?? "", broker: b.broker ?? "",
  origin: b.origin ?? "", destination: b.destination ?? "", dispatcher: b.dispatcher ?? "",
  rate: b.rate ?? 0, added: b.added ?? 0, deducted: b.deducted ?? 0, net: b.net ?? 0,
  notes: b.notes ?? "", completedAt: b.completed_at ?? "",
});

export const PAGE_SIZE = 20;

/** A page of payouts, with the sums over everything the filters match (not just this page). */
export function listPayouts(p: { q: string; dispatcherId: string; page: number } & Range): Promise<{ items: Payout[]; total: number; totals: PayoutTotals }> {
  return remembered(`payouts|${p.q}|${p.dispatcherId}|${p.from}|${p.to}|${p.page}`, async () => {
    const { items, total, totals } = await api.list<Raw>("/payouts", {
      q: p.q || undefined, dispatcher_id: p.dispatcherId || undefined, from: p.from || undefined, to: p.to || undefined,
      page: p.page, page_size: PAGE_SIZE,
    });
    return { items: items.map(toPayout), total, totals: { rate: totals.rate ?? 0, added: totals.added ?? 0, deducted: totals.deducted ?? 0, net: totals.net ?? 0 } };
  });
}

/** Changes what was added to or deducted from a payout. The lists kept in memory are stale after it. */
export async function adjustPayout(id: string, change: { added: number; deducted: number; notes: string }): Promise<Payout> {
  const updated = toPayout(await api.patch<Raw>(`/payouts/${id}`, change));
  forget("payouts|");
  return updated;
}

export interface DispatcherOption { id: string; name: string }

// Who to filter by: everyone who can dispatch today, and everyone named on a past payout
// (someone who has since changed role can still be filtered for). Either request may be
// refused — reading users is a separate permission — and the other still fills the list.
export function payoutDispatchers(): Promise<DispatcherOption[]> {
  return remembered("dispatchers", async () => {
    const [current, past] = await Promise.allSettled([
      api.get<Raw[]>("/company/users?role=dispatcher"),
      api.get<Raw[]>("/payouts/dispatchers"),
    ]);
    const byId = new Map<string, DispatcherOption>();
    // Past first, so a current user's live name wins over an older payout's copy of it.
    if (past.status === "fulfilled") for (const d of past.value ?? []) byId.set(d.id, { id: d.id, name: d.name || "Unknown" });
    if (current.status === "fulfilled") for (const u of current.value ?? []) byId.set(u.id, { id: u.id, name: u.full_name ?? u.login ?? "Unknown" });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}

// ─── Dispatcher KPI ───────────────────────────────────────────────────────────

export interface KpiRow { id: string; name: string; loads: number; rateTotal: number; percentMin: number; percentMax: number; amount: number }
export interface KpiSummary { rows: KpiRow[]; loads: number; rateTotal: number; amount: number }
export interface KpiLoad { id: string; loadRef: string; broker: string; driver: string; completedAt: string; rate: number; percent: number; amount: number }

const rangeQuery = (r: Range) => [r.from && `from=${r.from}`, r.to && `to=${r.to}`].filter(Boolean).join("&");

/** What each dispatcher earned in the period. */
export function kpiSummary(r: Range): Promise<KpiSummary> {
  return remembered(`kpi|summary|${r.from}|${r.to}`, async () => {
    const d = await api.get<Raw>(`/kpi/summary${rangeQuery(r) ? `?${rangeQuery(r)}` : ""}`);
    return {
      rows: (d?.rows ?? []).map((x: Raw): KpiRow => ({
        id: x.dispatcher_id, name: x.name || "Unknown", loads: x.loads ?? 0, rateTotal: x.rate_total ?? 0,
        percentMin: x.percent_min ?? 0, percentMax: x.percent_max ?? 0, amount: x.amount ?? 0,
      })),
      loads: d?.totals?.loads ?? 0, rateTotal: d?.totals?.rate_total ?? 0, amount: d?.totals?.amount ?? 0,
    };
  });
}

/** The loads behind one dispatcher's number. */
export function kpiLoads(dispatcherId: string, r: Range): Promise<KpiLoad[]> {
  return remembered(`kpi|loads|${dispatcherId}|${r.from}|${r.to}`, async () => {
    const rows = await api.get<Raw[]>(`/kpi/loads?dispatcher_id=${dispatcherId}${rangeQuery(r) ? `&${rangeQuery(r)}` : ""}`);
    return (rows ?? []).map((x): KpiLoad => ({
      id: x.payout_id, loadRef: x.load_ref ?? "", broker: x.broker ?? "", driver: x.driver ?? "",
      completedAt: x.completed_at ?? "", rate: x.rate ?? 0, percent: x.percent ?? 0, amount: x.amount ?? 0,
    }));
  });
}

/** "2%", or "1–2%" when the percent changed inside the period; "" when none is set. */
export const percentLabel = (r: KpiRow) => (r.percentMax === 0 ? "" : r.percentMin === r.percentMax ? `${r.percentMax}%` : `${r.percentMin}–${r.percentMax}%`);
