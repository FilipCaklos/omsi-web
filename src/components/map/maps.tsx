"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { MAP_CENTER, MAP_ZOOM, TILE_ATTRIBUTION, TILE_URL } from "@/lib/geo";

type Leaflet = typeof import("leaflet");

/** Leaflet sa načíta až v prehliadači (pracuje s window); bez JavaScriptu ostane prázdny rámik. */
function useLeafletMap(container: React.RefObject<HTMLDivElement | null>, init: (L: Leaflet, map: LeafletMap) => void) {
  const initRef = useRef(init);
  initRef.current = init;
  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { center: MAP_CENTER, zoom: MAP_ZOOM, scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
      // Rozmer kontajnera sa môže ustáliť až po načítaní štýlov – prepočítať pred umiestnením bodov
      map.invalidateSize();
      initRef.current(L, map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [container]);
}

const markerStyle = { radius: 8, color: "#b45309", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.9 } as const;

/** Výber polohy mapy v Upload Wizarde: klik nastaví špendlík, hodnoty idú v skrytých poliach. */
export function LocationPicker({ initial, labels }: { initial: { lat: number; lng: number } | null; labels: { hint: string; clear: string; none: string } }) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<CircleMarker | null>(null);
  const [point, setPoint] = useState(initial);

  useLeafletMap(container, (L, map) => {
    if (initial) {
      marker.current = L.circleMarker([initial.lat, initial.lng], markerStyle).addTo(map);
      map.setView([initial.lat, initial.lng], 11);
    }
    map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      marker.current?.remove();
      marker.current = L.circleMarker([lat, lng], markerStyle).addTo(map);
      setPoint({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
    });
  });

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="mapLat" value={point?.lat ?? ""} />
      <input type="hidden" name="mapLng" value={point?.lng ?? ""} />
      <div ref={container} className="h-72 w-full overflow-hidden rounded-[5px] border border-line" />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{labels.hint}</span>
        <span className="font-mono">{point ? `${point.lat}, ${point.lng}` : labels.none}</span>
        {point && (
          <button
            type="button"
            onClick={() => {
              marker.current?.remove();
              marker.current = null;
              setPoint(null);
            }}
            className="text-amber underline underline-offset-2"
          >
            {labels.clear}
          </button>
        )}
      </p>
    </div>
  );
}

export type MapPin = { slug: string; title: string; lat: number; lng: number; imageId: string | null; place: string | null };

/**
 * „Mapa máp“: špendlík pre každú OMSI mapu, v bublinke náhľad a odkaz.
 * Bublinky sa skladajú z DOM uzlov (textContent), nie z HTML reťazca – názov od autora nemôže vložiť HTML.
 */
export function MapOfMaps({ pins, focus, openLabel }: { pins: MapPin[]; focus: string | null; openLabel: string }) {
  const container = useRef<HTMLDivElement>(null);

  useLeafletMap(container, (L, map) => {
    map.scrollWheelZoom.enable();
    const bounds: [number, number][] = [];
    for (const pin of pins) {
      const popup = document.createElement("div");
      popup.className = "space-y-1";
      if (pin.imageId) {
        const img = document.createElement("img");
        img.src = `/api/media/${pin.imageId}?variant=thumb`;
        img.alt = "";
        img.width = 240;
        img.height = 135;
        img.style.borderRadius = "4px";
        popup.append(img);
      }
      const title = document.createElement("strong");
      title.textContent = pin.title;
      popup.append(title);
      if (pin.place) {
        const place = document.createElement("div");
        place.textContent = pin.place;
        place.style.opacity = "0.75";
        popup.append(place);
      }
      const link = document.createElement("a");
      link.href = `/mod/${pin.slug}`;
      link.textContent = openLabel;
      popup.append(link);

      const marker = L.circleMarker([pin.lat, pin.lng], markerStyle).addTo(map).bindPopup(popup, { maxWidth: 260 });
      marker.bindTooltip(pin.title, { direction: "top", offset: [0, -6] });
      bounds.push([pin.lat, pin.lng]);
      if (pin.slug === focus) {
        map.setView([pin.lat, pin.lng], 11);
        marker.openPopup();
      }
    }
    if (!focus && bounds.length > 1) {
      const fit = () => map.fitBounds(bounds, { padding: [60, 60], maxZoom: 9 });
      fit();
      // Druhé prispôsobenie po vykreslení (CSS Leafletu a výška 70vh sa načítajú neskôr)
      requestAnimationFrame(() => {
        map.invalidateSize();
        fit();
      });
    }
  });

  return <div ref={container} className="h-[70vh] min-h-96 w-full overflow-hidden rounded-[5px] border border-line" />;
}
