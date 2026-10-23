// Address search and lookup through Google (Places API, via the Maps JavaScript API).
//
// Used for two things: suggesting addresses as a stop is typed, and turning a line of text
// ("4750 W Mohave St, Phoenix, AZ") into a point on the map. It goes through Google's
// JavaScript library rather than raw web requests because that is the path a browser key —
// one locked to our domains — is allowed to use.
//
// Everything here is optional. With no key configured, or when Google cannot be reached,
// each function reports "not available" (null) and the caller falls back to OpenStreetMap,
// so the form keeps working either way.

const KEY: string = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "";

/** Whether Google address search is configured at all. */
export const placesEnabled = KEY !== "";

export interface PlaceAddress {
  street: string;
  city: string;
  state: string;   // two-letter code
  zip: string;     // "" when the place has none (a bare city)
  lat: number;
  lng: number;
}

export interface PlaceSuggestion {
  id: string;
  text: string;                               // "4750 W Mohave St, Phoenix, AZ"
  resolve: () => Promise<PlaceAddress | null>; // fetch the address fields and the point
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lib = any;
let libPromise: Promise<Lib | null> | null = null;

// Loads Google's library once, on first use — not at page load, so screens that never
// search an address never fetch it.
function load(): Promise<Lib | null> {
  if (!placesEnabled) return Promise.resolve(null);
  if (libPromise) return libPromise;
  libPromise = new Promise<Lib | null>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const ready = () => w.google.maps.importLibrary("places").then(resolve, () => resolve(null));
    if (w.google?.maps?.importLibrary) { ready(); return; }
    w.__breloMapsReady = ready;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&libraries=places&callback=__breloMapsReady`;
    s.async = true;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  }).then((lib) => {
    if (!lib) libPromise = null; // a failed load may be retried later
    return lib;
  });
  return libPromise;
}

// A billing "session" ties the keystrokes of one search to the pick that ends it, so
// Google charges for the search once rather than per letter. Started on the first
// suggestion request and closed when a suggestion is resolved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = null;

/** Suggestions for a partly typed address, US only. Null when Google isn't available. */
export async function suggestAddresses(input: string): Promise<PlaceSuggestion[] | null> {
  const lib = await load();
  if (!lib) return null;
  try {
    session ??= new lib.AutocompleteSessionToken();
    const used = session;
    const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input, includedRegionCodes: ["us"], sessionToken: used,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (suggestions ?? []).flatMap((s: any) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [{
        id: p.placeId,
        text: stripCountry(p.text?.text ?? ""),
        resolve: async () => {
          try {
            const place = p.toPlace();
            // Essentials fields only. A place's name (displayName) would bill every pick at the
            // Pro price, about 3× — and a rate con's stop always has its street address.
            await place.fetchFields({ fields: ["addressComponents", "formattedAddress", "location"] });
            if (session === used) session = null; // the pick closes the session
            return toAddress(place);
          } catch { return null; }
        },
      }];
    });
  } catch {
    return null;
  }
}

type LatLngLiteral = { lat: number; lng: number };

/**
 * The point for a line of address text, found in the background (no suggestion was picked:
 * a rate con's stops, a driver's location, an older stop). Null when Google can't place it or
 * isn't available, and the caller falls back to OpenStreetMap.
 *
 * Geocoding first: made for addresses, about a sixth of Text Search's price, and it says how
 * sure it is. Its answer is taken when the whole text matched and it is the building (or a
 * point on its stretch of street), or when the text has no house number to find (a city, a
 * zip). Otherwise Text Search is asked once, as before; an approximate geocode is kept only
 * when that finds nothing either.
 */
export async function locateText(text: string): Promise<LatLngLiteral | null> {
  const lib = await load();
  if (!lib) return null;
  const geo = await geocode(text);
  if (geo && !geo.partial && (geo.precise || !/^\s*\d/.test(text))) return geo.at;
  try {
    const { places } = await lib.Place.searchByText({ textQuery: text, fields: ["location"], region: "us", maxResultCount: 1 });
    const at = places?.[0]?.location;
    if (at) return { lat: at.lat(), lng: at.lng() };
  } catch { /* fall through to what geocoding gave */ }
  return geo?.at ?? null;
}

// Google's geocoder on the text: the first result's point, whether it is the building itself
// (ROOFTOP) or interpolated along its block (RANGE_INTERPOLATED) rather than the middle of a
// street, town or zip, and whether only part of the text matched. Null on no result or error.
async function geocode(text: string): Promise<{ at: LatLngLiteral; precise: boolean; partial: boolean } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
    const { results } = await new Geocoder().geocode({ address: text, region: "us", componentRestrictions: { country: "US" } });
    const r = results?.[0];
    if (!r) return null;
    const type = r.geometry?.location_type;
    return {
      at: { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() },
      precise: type === "ROOFTOP" || type === "RANGE_INTERPOLATED",
      partial: !!r.partial_match,
    };
  } catch {
    return null;
  }
}

const stripCountry = (t: string) => t.replace(/,\s*(USA|United States)$/i, "");

// Google's place → the three fields a stop stores, plus its point.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAddress(place: any): PlaceAddress | null {
  const at = place.location;
  if (!at) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comps: any[] = place.addressComponents ?? [];
  const part = (type: string, short = false): string => {
    const c = comps.find((x) => x.types?.includes(type));
    return c ? (short ? c.shortText : c.longText) ?? "" : "";
  };
  const state = part("administrative_area_level_1", true);

  // The city as it is written on mail and on a rate con. Google's "locality" is the legal
  // municipality, which can differ ("Glendale" for an address everyone writes as "Waddell,
  // AZ") — the formatted address carries the postal one, right before the state.
  const formatted: string = place.formattedAddress ?? "";
  const tokens = formatted.split(",").map((t: string) => t.trim());
  const stateAt = tokens.findIndex((t: string) => state !== "" && new RegExp(`^${state}(\\s+\\d{5}(-\\d{4})?)?$`).test(t));
  const city = (stateAt > 0 ? tokens[stateAt - 1] : "") || part("locality") || part("sublocality") || part("postal_town") || part("administrative_area_level_3") || part("neighborhood");
  if (!city || !state) return null;

  // The street address: its number and road; nothing for a bare city or zip.
  const number = part("street_number"), road = part("route", true);
  const street = [number, road].filter(Boolean).join(" ");

  return { street: street === city ? "" : street, city, state, zip: part("postal_code"), lat: at.lat(), lng: at.lng() };
}
