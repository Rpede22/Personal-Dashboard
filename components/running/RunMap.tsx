"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

// Decode Google's encoded polyline format (used by Strava)
function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

export default function RunMap({
  polyline,
  height = 400,
}: {
  polyline: string;
  height?: number | string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const coords = decodePolyline(polyline);
    if (coords.length === 0) return;

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    const line = L.polyline(coords, { color: "#22c55e", weight: 4, opacity: 0.9 }).addTo(map);

    // Start dot (green) and end dot (red)
    L.circleMarker(coords[0], { radius: 6, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }).addTo(map);
    L.circleMarker(coords[coords.length - 1], { radius: 6, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }).addTo(map);

    map.fitBounds(line.getBounds(), { padding: [16, 16] });

    // Defensive: browsers may report the container size after a couple of frames
    // (flex layouts). Schedule an explicit re-measure so tiles load at the real size.
    const rafId = requestAnimationFrame(() => {
      if (!mapRef.current) return;
      mapRef.current.invalidateSize();
      mapRef.current.fitBounds(line.getBounds(), { padding: [16, 16] });
    });

    // Watch the container for size changes (flex layouts settle async, fullscreen
    // toggles resize instantly) — invalidateSize + re-fit so tiles fill the view.
    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return;
      mapRef.current.invalidateSize();
      mapRef.current.fitBounds(line.getBounds(), { padding: [16, 16] });
    });
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [polyline]);

  return (
    <div
      ref={containerRef}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: "12px",
        overflow: "hidden",
      }}
    />
  );
}
