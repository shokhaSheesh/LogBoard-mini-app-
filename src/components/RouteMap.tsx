import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { routePath, type LatLng } from "../lib/geo";

// A stop to pin: where it is and the letter it carries (A, B, C …) — the same letter the
// form and the summary use for that stop.
export interface RoutePoint extends LatLng { label: string; title?: string }

const US_CENTER: L.LatLngExpression = [39.5, -98.35];

// Lettered pin, drawn in CSS so it follows the brand colour and needs no image files
// (Leaflet's default marker relies on PNGs that bundlers routinely fail to resolve).
function pin(label: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:50%;background:var(--pine);color:#fff;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-family:var(--font);font-size:12px;font-weight:700">${label}</div>`,
  });
}

// The route on a map: one lettered pin per located stop and a line through them in order.
// The line follows the roads when the router answers, and is drawn straight (dashed)
// until then or when it can't — so there is always something to look at.
// `height` is a pixel height, or "fill" to take the height of the box it sits in.
export function RouteMap({ points, height = 260 }: { points: RoutePoint[]; height?: number | "fill" }) {
  const boxRef   = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!boxRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
      .setView(US_CENTER, 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The container can change size after first paint (fonts, the column settling).
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(boxRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  // Redraw whenever the stops change. Keyed on the coordinates and letters themselves so
  // an unrelated re-render (typing in another field) doesn't refetch the road path.
  const sig = points.map((p) => `${p.label}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (points.length === 0) { map.setView(US_CENTER, 4); return; }

    const latlngs = points.map((p) => [p.lat, p.lng] as L.LatLngTuple);
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: pin(p.label), title: p.title, keyboard: false }).addTo(layer);
    }
    if (points.length === 1) { map.setView(latlngs[0], 9); return; }

    const brand = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#178A4C";
    const straight = L.polyline(latlngs, { color: brand, weight: 3, opacity: 0.7, dashArray: "6 8" }).addTo(layer);
    map.fitBounds(straight.getBounds(), { padding: [34, 34] });

    const ctl = new AbortController();
    routePath(points, ctl.signal).then((path) => {
      if (ctl.signal.aborted || !path) return;
      layer.removeLayer(straight);
      const road = L.polyline(path.map((c) => [c.lat, c.lng] as L.LatLngTuple), { color: brand, weight: 4, opacity: 0.9 }).addTo(layer);
      road.bringToBack();
      map.fitBounds(road.getBounds(), { padding: [34, 34] });
    });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", backgroundColor: "var(--fill)", height: height === "fill" ? "100%" : undefined, boxSizing: "border-box" }}>
      {/* isolation keeps Leaflet's internal z-indexes from climbing over dropdowns and dialogs */}
      <div ref={boxRef} style={{ height: height === "fill" ? "100%" : height, width: "100%", isolation: "isolate" }} aria-label="Route map" role="img" />
      {points.length === 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "8px 12px", backgroundColor: "color-mix(in srgb, var(--card) 92%, transparent)", borderTop: "1px solid var(--line)", fontFamily: "var(--font)", fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
          Pick an address for a stop and it shows up here
        </div>
      )}
    </div>
  );
}
