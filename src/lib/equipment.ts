import { api } from "./api";
import { forget, remembered } from "./cache";
import { driverDisplayName } from "./driverName";

// The company's trucks and trailers. The two are the same shape and live at /trucks and
// /trailers; a truck may also report its odometer, through the ELD of whoever drives it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export type Kind = "trucks" | "trailers";
export const one = (kind: Kind) => (kind === "trucks" ? "truck" : "trailer");

export interface Equipment {
  id: string;
  unit: string;
  /** Who has it now: the name to show, and the id the assignment is saved by. */
  driver: string;
  driverId: string;
  make: string;
  model: string;
  vin: string;
  /** Miles, trucks only, when the ELD reports it. */
  odometer?: number;
}

export const EMPTY_EQUIPMENT: Equipment = { id: "", unit: "", driver: "", driverId: "", make: "", model: "", vin: "" };

const toEquipment = (u: Raw): Equipment => ({
  id: u.id, unit: u.unit ?? "", driverId: u.driver_id ?? "",
  driver: u.driver ? driverDisplayName({ name: u.driver, name2: u.driver_name2, team: u.driver_team }) : "",
  make: u.make ?? "", model: u.model ?? "", vin: u.vin ?? "", odometer: u.odometer ?? undefined,
});

// Only what can be written; the driver's name and the odometer are worked out by the server.
const toBody = (e: Equipment) => ({ unit: e.unit.trim(), driver_id: e.driverId || null, make: e.make.trim(), model: e.model.trim(), vin: e.vin.trim().toUpperCase() });

export const PAGE_SIZE = 20;

export function listEquipment(kind: Kind, q: string, page: number): Promise<{ items: Equipment[]; total: number }> {
  return remembered(`equipment|${kind}|${q}|${page}`, async () => {
    const { items, total } = await api.list<Raw>(`/${kind}`, { q: q || undefined, page, page_size: PAGE_SIZE });
    return { items: items.map(toEquipment), total };
  });
}

// A change here also moves what drivers are shown to have, and the counts on the Profile.
function changed() { forget("equipment|"); forget("fleet-counts"); forget("drivers|"); }

export async function saveEquipment(kind: Kind, e: Equipment): Promise<void> {
  if (e.id) await api.put(`/${kind}/${e.id}`, toBody(e));
  else await api.post(`/${kind}`, toBody(e));
  changed();
}

export async function deleteEquipment(kind: Kind, id: string): Promise<void> {
  await api.delete(`/${kind}/${id}`);
  changed();
}
