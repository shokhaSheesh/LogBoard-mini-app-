import { api } from "./api";
import { forget, remembered } from "./cache";
import { driverDisplayName } from "./driverName";
import type { Status } from "./statuses";

// The driver roster: who drives for the company, what they drive and how they are paid.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export type DriverType = "O/O" | "C/D";
/** "" is "not set": the driver's pay then reports as 0 rather than being guessed. */
export type PayType = "" | "rpm" | "percent";

export interface Driver {
  id: string;
  /** Two people sharing one truck; name2/phone2 are the second. */
  team: boolean;
  name: string;
  name2: string;
  phone: string;
  phone2: string;
  type: DriverType;
  status: Status;
  /** Unit numbers, for display. The assignment itself is truckId/trailerId. */
  truck: string;
  trailer: string;
  truckId: string;
  trailerId: string;
  /** Where the dispatcher says the driver is; the truck's own report, when there is one, wins. */
  location: string;
  eldLocation: string;
  eldLat?: number;
  eldLng?: number;
  comment: string;
  target: number;
  payType: PayType;
  /** Dollars per mile for "rpm", a percentage (0–100) for "percent". */
  payRate: number;
  currentLoad: string;
  currentLoadId: string;
  nextLoadId: string;
  nextLoads: { id: string; ref: string }[];
}

export const EMPTY_DRIVER: Driver = {
  id: "", team: false, name: "", name2: "", phone: "", phone2: "", type: "C/D", status: "ready",
  truck: "", trailer: "", truckId: "", trailerId: "", location: "", eldLocation: "", comment: "",
  target: 0, payType: "", payRate: 0, currentLoad: "", currentLoadId: "", nextLoadId: "", nextLoads: [],
};

export function toDriver(d: Raw): Driver {
  return {
    id: d.id, team: !!d.team, name: d.name ?? "", name2: d.name2 ?? "", phone: d.phone ?? "", phone2: d.phone2 ?? "",
    type: d.type === "O/O" ? "O/O" : "C/D", status: (d.status as Status) ?? "ready",
    truck: d.truck ?? "", trailer: d.trailer ?? "", truckId: d.truck_id ?? "", trailerId: d.trailer_id ?? "",
    location: d.location ?? "", eldLocation: d.eld?.location ?? "", eldLat: d.eld?.lat ?? undefined, eldLng: d.eld?.lng ?? undefined,
    comment: d.comment ?? "", target: d.weekly_gross_target ?? 0,
    payType: d.pay_type === "rpm" || d.pay_type === "percent" ? d.pay_type : "", payRate: d.pay_rate ?? 0,
    currentLoad: d.current_load ?? "", currentLoadId: d.current_load_id ?? "", nextLoadId: d.next_load_id ?? "",
    nextLoads: (d.next_loads ?? []).map((l: Raw) => ({ id: l.id, ref: l.load_id ?? "" })),
  };
}

// Saving replaces the whole driver, so every field is sent. Names are stored uppercase:
// payouts and team rosters match on the name as written, and one spelling keeps them in
// step. The truck and trailer are assigned by id; "" unassigns.
function toBody(d: Driver, payActiveFrom?: string) {
  return {
    name: d.name.trim().toUpperCase(), phone: d.phone.trim(),
    team: d.team, name2: d.team ? d.name2.trim().toUpperCase() : "", phone2: d.team ? d.phone2.trim() : "",
    type: d.type, status: d.status, truck_id: d.truckId, trailer_id: d.trailerId,
    location: d.location.trim(), comment: d.comment.trim(), weekly_gross_target: d.target,
    // A rate without a type means nothing, so it is never sent alone.
    pay_type: d.payType, pay_rate: d.payType ? d.payRate : 0,
    // Only read by the server when the pay is changing: the day the new pay starts.
    pay_active_from: payActiveFrom || undefined,
    next_load_id: d.nextLoadId || null,
  };
}

export const displayName = (d: Driver) => driverDisplayName(d);
export const describePay = (type: PayType, rate: number) => (type === "percent" ? `${rate}% of gross` : type === "rpm" ? `$${rate}/mi` : "Not set");

export const PAGE_SIZE = 20;

export function listDrivers(p: { q: string; status: string; team: boolean; page: number }): Promise<{ items: Driver[]; total: number }> {
  return remembered(`drivers|list|${p.q}|${p.status}|${p.team}|${p.page}`, async () => {
    const { items, total } = await api.list<Raw>("/drivers", { q: p.q || undefined, status: p.status || undefined, team: String(p.team), page: p.page, page_size: PAGE_SIZE });
    return { items: items.map(toDriver), total };
  });
}

export const getDriver = (id: string): Promise<Driver> => remembered(`drivers|one|${id}`, async () => toDriver(await api.get<Raw>(`/drivers/${id}`)));

// Every change makes the lists and pages kept in memory stale.
/** For a change made somewhere else that moves a driver (completing their load). */
export const driversChanged = () => forget("drivers|");
export async function createDriver(d: Driver): Promise<Driver> {
  const made = toDriver(await api.post<Raw>("/drivers", toBody(d)));
  forget("drivers|");
  return made;
}
export async function updateDriver(d: Driver, payActiveFrom?: string): Promise<void> {
  await api.put(`/drivers/${d.id}`, toBody(d, payActiveFrom));
  forget("drivers|");
}
export async function deleteDriver(id: string): Promise<void> {
  await api.delete(`/drivers/${id}`);
  forget("drivers|");
}

// ─── A driver's week ──────────────────────────────────────────────────────────

export interface DriverWeek {
  from: string;
  to: string;
  gross: number;
  loads: number;
  miles: number;
  rpm: number;
  driverPay: number;
  target: number;
  rows: { id: string; ref: string; origin: string; destination: string; miles: number; payout: number; status: Status; completedAt: string }[];
}

/** One work week of a driver's numbers. With no dates the server answers with the current week. */
export function driverWeek(id: string, from?: string, to?: string): Promise<DriverWeek> {
  return remembered(`drivers|week|${id}|${from ?? ""}|${to ?? ""}`, async () => {
    const d = await api.get<Raw>(`/drivers/${id}/detail${from && to ? `?from=${from}&to=${to}` : ""}`);
    const s = d?.summary ?? {};
    return {
      from: d?.week?.from ?? "", to: d?.week?.to ?? "",
      gross: s.gross ?? 0, loads: s.loads ?? 0, miles: s.miles ?? 0, rpm: s.rpm ?? 0, driverPay: s.driver_pay ?? 0, target: s.weekly_target ?? 0,
      rows: (d?.loads ?? []).map((l: Raw) => ({
        id: l.id, ref: l.load_id ?? "", origin: l.origin ?? "", destination: l.destination ?? "",
        miles: l.miles ?? 0, payout: l.payout ?? 0, status: l.status as Status, completedAt: l.completed_at ?? "",
      })),
    };
  });
}

// ─── Trucks and trailers to assign ────────────────────────────────────────────

export interface Unit { id: string; unit: string; takenBy: string }

/** Trucks or trailers matching a search, each with whoever has it now. */
export async function listUnits(kind: "trucks" | "trailers", q: string): Promise<Unit[]> {
  const { items } = await api.list<Raw>(`/${kind}`, { q: q || undefined, page: 1, page_size: 30 });
  return items.map((u) => ({ id: u.id, unit: u.unit ?? "", takenBy: u.driver ? driverDisplayName({ name: u.driver, name2: u.driver_name2, team: u.driver_team }) : "" }));
}
