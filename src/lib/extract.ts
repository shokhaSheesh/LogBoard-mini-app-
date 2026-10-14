import { api } from "./api";
import { formatAppt } from "./appt";
import { geocodeCity } from "./geo";
import { EMPTY_STOP, fullAddress, TIME_ZONES, type Load, type Stop } from "./loads";

// AI smart extract: a broker's rate confirmation — a photo, a PDF, or its text pasted in —
// read by the server into a draft load. Nothing is saved by it: the draft fills the New
// load form, and a person checks it before it becomes a load.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** The server's own limit; checked here too so a big file fails before the upload. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** What a draft fills in. The driver and dispatcher are a person's call, so they aren't here. */
export type Draft = Pick<Load, "loadId" | "broker" | "payout" | "miles" | "deadhead" | "refNumber" | "poNumber" | "otherNumber" | "stops">;

// Beside the draft, the server says where the four values a mistake costs money on were
// read from, and lists what a person should look at before saving. Nothing here blocks a
// save: a draft is a suggestion, and these are the places to look first.

/** The draft fields a warning can name. */
export type ReviewField = "load_id" | "broker" | "payout" | "miles" | "stops";
export interface Evidence { quote: string; page: number; status: "verified" | "unverified" | "not_found" }
export interface Warning { code: string; field: string; message: string }
// Who read the document: a model, or "template" — a broker layout the server learned from
// this company's earlier documents, read instantly and without a model.
export interface Review { evidence: Partial<Record<ReviewField, Evidence>>; warnings: Warning[]; fromTemplate: boolean }
export interface Extraction { draft: Draft; review: Review }

const KEY_FIELDS: ReviewField[] = ["load_id", "broker", "payout", "miles"];
/** A photo or a scan has no text to check a value against, so nothing could be verified. */
export const uncheckable = (r: Review) =>
  Object.keys(r.evidence).length > 0 && KEY_FIELDS.every((f) => (r.evidence[f]?.status ?? "unverified") === "unverified");

function toReview(res: Raw): Review {
  return { evidence: res?.evidence ?? {}, warnings: Array.isArray(res?.warnings) ? res.warnings : [], fromTemplate: res?.meta?.provider === "template" };
}

function toDraft(d: Raw): Draft {
  const stops: Stop[] = (Array.isArray(d?.stops) ? d.stops : []).map((s: Raw) => ({
    ...EMPTY_STOP,
    // The document nearly always prints the place's name and its zip; both are kept.
    facility: s.facility ?? "", street: s.street ?? "", city: s.city ?? "", state: s.state ?? "", zip: s.zip ?? "",
    // The appointment as printed, in the app's one format; wording that is only a label
    // ("Appointment", "TBD") comes back empty rather than pretending to be a time.
    appt: formatAppt(s.appt), done: false,
    // Taken only when they are values the form knows; anything else is left for a person.
    apptTz: (TIME_ZONES as readonly string[]).includes(s.appt_tz) ? s.appt_tz : "",
    ref: String(s.ref ?? "").trim(),
    kind: s.kind === "pickup" || s.kind === "delivery" ? s.kind : "",
  }));
  // The form expects at least a pickup and a delivery to fill in.
  while (stops.length < 2) stops.push({ ...EMPTY_STOP });
  return {
    loadId: d?.load_id ?? "", broker: d?.broker ?? "", payout: d?.payout ?? 0, miles: d?.miles ?? 0, deadhead: d?.deadhead_distance ?? 0,
    // The load's other numbers, "" when the document doesn't print them.
    refNumber: String(d?.ref_number ?? "").trim(), poNumber: String(d?.po_number ?? "").trim(), otherNumber: String(d?.other_number ?? "").trim(),
    stops,
  };
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
/** A reading as the server sends one — from the extract endpoint, or a draft the bot made. */
export async function fromReading(res: Raw): Promise<Extraction> {
  return { draft: await locate(toDraft(res?.draft)), review: toReview(res) };
}
export async function extractFromFile(file: File): Promise<Extraction> {
  return fromReading(await api.upload<Raw>("/loads/extract", file));
}
export async function extractFromText(text: string): Promise<Extraction> {
  return fromReading(await api.post<Raw>("/loads/extract", { text }));
}
