import { api } from "./api";
import { formatAppt } from "./appt";
import { geocodeCity } from "./geo";
import { fullAddress, type Load, type Stop } from "./loads";

// AI smart extract: a broker's rate confirmation — a photo, a PDF, or its text pasted in —
// read by the server into a draft load. Nothing is saved by it: the draft fills the New
// load form, and a person checks it before it becomes a load.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** The server's own limit; checked here too so a big file fails before the upload. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** What a draft fills in. The driver and dispatcher are a person's call, so they aren't here. */
export type Draft = Pick<Load, "loadId" | "broker" | "payout" | "miles" | "deadhead" | "stops">;

function toDraft(d: Raw): Draft {
  const stops: Stop[] = (Array.isArray(d?.stops) ? d.stops : []).map((s: Raw) => ({
    street: s.street ?? "", city: s.city ?? "", state: s.state ?? "",
    // The appointment as printed, in the app's one format; wording that is only a label
    // ("Appointment", "TBD") comes back empty rather than pretending to be a time.
    appt: formatAppt(s.appt), done: false,
  }));
  // The form expects at least a pickup and a delivery to fill in.
  while (stops.length < 2) stops.push({ street: "", city: "", state: "", appt: "", done: false });
  return { loadId: d?.load_id ?? "", broker: d?.broker ?? "", payout: d?.payout ?? 0, miles: d?.miles ?? 0, deadhead: d?.deadhead_distance ?? 0, stops };
}

// A stop can only be saved once it has a point on the map. The document gives addresses,
// not points, so each is looked up here; one that can't be found is left for the person to
// pick in the Route step, which says so.
async function locate(draft: Draft): Promise<Draft> {
  const stops = await Promise.all(draft.stops.map(async (s) => {
    if (!s.city.trim()) return s;
    const at = await geocodeCity(fullAddress(s)).catch(() => null);
    return at ? { ...s, lat: at.lat, lng: at.lng } : s;
  }));
  return { ...draft, stops };
}

// Reading takes a while — tens of seconds for a long PDF — because a model reads the page.
export async function extractFromFile(file: File): Promise<Draft> {
  return locate(toDraft((await api.upload<Raw>("/loads/extract", file))?.draft));
}
export async function extractFromText(text: string): Promise<Draft> {
  return locate(toDraft((await api.post<Raw>("/loads/extract", { text }))?.draft));
}
