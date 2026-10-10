// Geocoding + routing helpers. Address lookup prefers Google (lib/places) and falls back
// to OpenStreetMap's Nominatim; routing uses the OSRM public demo server.
//
// These are public, rate-limited community servers, so every request is given a hard
// timeout and can be cancelled via an external AbortSignal — a slow or hung request must
// never leave the UI spinning. Callers should geocode *sequentially* (not in parallel):
// Nominatim throttles bursts from a single client.

import { locateText } from "./places";

export interface LatLng { lat: number; lng: number }

const REQUEST_TIMEOUT_MS = 8000;

// fetch → JSON with a hard timeout and optional external cancellation. Returns null on any
// failure (network error, non-2xx, timeout, abort) so callers never have to catch.
async function fetchJson(url: string, external?: AbortSignal): Promise<any | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  const relay = () => ctl.abort();
  external?.addEventListener("abort", relay);
  try {
    const res = await fetch(url, { headers: { "Accept-Language": "en" }, signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", relay);
  }
}

// Resolve a line of address text — "4750 W Mohave St, Phoenix, AZ" or just "Phoenix, AZ" —
// to coordinates. Null when nothing matches.
//
// Google is asked first when it is configured (it knows street numbers and facility names);
// OpenStreetMap answers otherwise, and whenever Google can't. Answers are remembered for
// the session: the same stop is looked up again every time its load is opened, and there
// is no reason to ask — or, with Google, to pay — twice.
const located = new Map<string, LatLng>();

export async function geocodeCity(q: string, signal?: AbortSignal): Promise<LatLng | null> {
  const key = q.trim().toLowerCase();
  if (!key) return null;
  const known = located.get(key);
  if (known) return known;

  let at: LatLng | null = await locateText(q);
  if (signal?.aborted) return null;
  if (!at) {
    const data: Array<{ lat: string; lon: string }> | null = await fetchJson(
      "https://nominatim.openstreetmap.org/search?" +
        new URLSearchParams({ q, format: "json", countrycodes: "us", limit: "1" }),
      signal
    );
    if (data?.length) at = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  if (at) located.set(key, at);
  return at;
}

// Total driving distance in miles through the given coordinates in order. Null on failure.
export async function routeMiles(coords: LatLng[], signal?: AbortSignal): Promise<number | null> {
  if (coords.length < 2) return null;
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const data = await fetchJson(
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=false`,
    signal
  );
  const meters = data?.routes?.[0]?.distance;
  return meters ? Math.round(meters / 1609.344) : null;
}

// The road path through the given coordinates, as points to draw on a map. Null when the
// router can't be reached or finds no route — callers fall back to straight lines.
export async function routePath(coords: LatLng[], signal?: AbortSignal): Promise<LatLng[] | null> {
  if (coords.length < 2) return null;
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const data = await fetchJson(
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=simplified&geometries=geojson`,
    signal
  );
  const line: [number, number][] | undefined = data?.routes?.[0]?.geometry?.coordinates;
  return line?.length ? line.map(([lng, lat]) => ({ lat, lng })) : null;
}
