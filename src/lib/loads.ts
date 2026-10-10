import { api } from "./api";
import { formatAppt } from "./appt";
import { driverDisplayName } from "./driverName";
import type { Status } from "./statuses";

// ─── A load, as the mini app holds it ──────────────────────────────────────────
// The same model as the web's Loads page, over the same API.

// An address is three fields (street, city, state); the API joins them wherever it shows
// one line. `lat`/`lng` are the stop's point on the map — a stop without them hasn't been
// located, and the form won't save it.
export interface Stop {
  street: string;
  city: string;
  state: string;
  appt: string;   // "16.07.26 · 08:00-14:00", or free wording ("FCFS")
  done: boolean;
  lat?: number;
  lng?: number;
}

export interface Load {
  id: string;
  loadId: string;        // the load number people use
  broker: string;
  status: Status;
  stops: Stop[];
  payout: number;        // the rate, in dollars
  miles: number;         // loaded miles
  deadhead: number;      // empty miles to the pickup
  driverId: string;
  driver: string;
  driverPhone: string;
  dispatcherId: string;
  dispatcher: string;
  truckUnit: string;
  trailerUnit: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export function toLoad(b: Raw): Load {
  return {
    id: b.id,
    loadId: b.load_id ?? "",
    broker: b.broker ?? "",
    status: b.status as Status,
    stops: (b.stops ?? []).map((s: Raw): Stop => ({
      street: s.street ?? "", city: s.city ?? "", state: s.state ?? "",
      appt: formatAppt(s.appt), done: !!s.done,
      lat: s.location?.lat ?? s.lat, lng: s.location?.lng ?? s.lng,
    })),
    payout: b.payout ?? 0,
    miles: b.miles ?? 0,
    deadhead: b.deadhead_distance ?? 0,
    driverId: b.driver_id ?? "",
    driver: b.driver ? driverDisplayName({ name: b.driver, name2: b.driver_name2, team: b.driver_team }) : "",
    driverPhone: b.driver_phone ?? "",
    dispatcherId: b.dispatcher_id ?? "",
    dispatcher: b.dispatcher ?? "",
    truckUnit: b.truck_unit ?? "",
    trailerUnit: b.trailer_unit ?? "",
  };
}

// The write body. PUT /loads/:id replaces the whole load, so every field goes back.
function toBody(l: Load, opts: { create?: boolean; omitStatus?: boolean } = {}) {
  return {
    load_id: l.loadId.trim(),
    broker: l.broker.trim(),
    // No driver is "" on create but null on update — null is what returns a load to the
    // unassigned pool (and rotates the old driver's queue).
    driver_id: l.driverId || (opts.create ? "" : null),
    dispatcher_id: l.dispatcherId || undefined,
    // A load waiting in a driver's queue carries an empty status; sending "" back would
    // make the API coerce it to a real one and wrongly activate the load. So an empty
    // status is left out, and omitStatus drops it altogether (see saveLoad).
    status: opts.omitStatus ? undefined : (l.status || undefined),
    payout: l.payout || 0,
    miles: l.miles || 0,
    deadhead_distance: l.deadhead || 0,
    stops: l.stops.map((s) => ({
      street: s.street.trim(), city: s.city.trim(), state: s.state.trim(), appt: s.appt, done: s.done,
      ...(s.lat != null && s.lng != null ? { location: { lat: s.lat, lng: s.lng } } : {}),
    })),
  };
}

// A completed load has driven its whole route: every stop is done.
const completed = (l: Load): Load => (l.status === "completed" ? { ...l, stops: l.stops.map((s) => ({ ...s, done: true })) } : l);

export const PAGE_SIZE = 20;

export async function listLoads(params: { q?: string; status?: string; page: number }): Promise<{ items: Load[]; total: number }> {
  const { items, total } = await api.list<Raw>("/loads", { q: params.q || undefined, status: params.status || undefined, page: params.page, page_size: PAGE_SIZE });
  return { items: items.map(toLoad), total };
}

export const getLoad = async (id: string): Promise<Load> => toLoad(await api.get<Raw>(`/loads/${id}`));

export const createLoad = async (l: Load): Promise<Load> => toLoad(await api.post<Raw>("/loads", toBody(completed(l), { create: true })));

// Saving an edit. Changing the driver is a queue move, not a field edit: the server detaches
// the old driver and slots the load onto the new one, where the slot decides the status. So
// when the driver changed and the status didn't, the status is not re-asserted — on a
// completed load that would re-attribute the payout to the new driver.
export async function updateLoad(l: Load, was: Load): Promise<Load> {
  const reassigning = l.driverId !== was.driverId;
  const pickedStatus = l.status !== was.status;
  return toLoad(await api.put<Raw>(`/loads/${l.id}`, toBody(completed(l), { omitStatus: reassigning && !pickedStatus })));
}

export const deleteLoad = (id: string) => api.delete(`/loads/${id}`);

// ─── People to assign ─────────────────────────────────────────────────────────

export interface DriverOption { id: string; name: string; unit: string; status: Status }

export async function searchDrivers(q: string): Promise<DriverOption[]> {
  const { items } = await api.list<Raw>("/drivers", { q: q || undefined, page: 1, page_size: 30 });
  return items.map((d) => ({ id: d.id, name: driverDisplayName(d), unit: d.truck ?? "", status: d.status as Status }));
}

export interface PersonOption { id: string; name: string }

// Who can be a load's dispatcher: the owner and everyone on the Dispatcher role.
export async function listDispatchers(): Promise<PersonOption[]> {
  const rows = await api.get<Raw[]>("/company/users?role=dispatcher");
  return (rows ?? []).map((u) => ({ id: u.id, name: u.full_name ?? u.login ?? "" }));
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** "4750 W Mohave St, Phoenix, AZ" — the whole address on one line. */
export const fullAddress = (s: { street?: string; city?: string; state?: string }) =>
  [s.street, s.city, s.state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");

/** "Phoenix, AZ" — what a list shows. */
export const cityState = (s: { city?: string; state?: string }) =>
  [s.city, s.state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");

// Whole dollars read cleanest; cents are shown only when the amount has them.
export const money = (n: number) => `$${n.toLocaleString("en-US", Number.isInteger(n) ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const milesText = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;
export const stopLetter = (i: number) => String.fromCharCode(65 + i);

export const EMPTY_LOAD: Load = {
  id: "", loadId: "", broker: "", status: "" as Status, stops: [
    { street: "", city: "", state: "", appt: "", done: false },
    { street: "", city: "", state: "", appt: "", done: false },
  ], payout: 0, miles: 0, deadhead: 0, driverId: "", driver: "", driverPhone: "", dispatcherId: "", dispatcher: "", truckUnit: "", trailerUnit: "",
};
