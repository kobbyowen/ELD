import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type LngLatBoundsLike, Map } from "maplibre-gl";
import type { TripCalcResponse } from "../lib/types";

type Props = { data: TripCalcResponse; height?: number };

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const PIN_BLUE = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#2563eb" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
</svg>`);

const PIN_ORANGE = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#f59e0b" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
</svg>`);

const FUEL_CYAN = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#06b6d4" d="M3 7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12H3V7Zm16.59 2.59L18 9v10a2 2 0 0 1-2 2h-1v-2h1V7a3 3 0 0 1 3-3h1v2h-1a1 1 0 0 0-1 1v2.59l1.29 1.3a1 1 0 0 1 .29.7V21h-2v-6.41l-.41-.41L19.59 9.6Z"/>
</svg>`);

const BED_RED = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#ef4444" d="M3 7h2v4h14a3 3 0 0 1 3 3v3h-2v-2H3v2H1V7h2Zm6 0a2 2 0 1 1 0 4H5V7h4Z"/>
</svg>`);

export default function TripMap({ data, height = 420 }: Props) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const routeGeo = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: data.route.geometry,
      properties: {},
    }),
    [data]
  );

  const stopsGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: data.stops.map((s) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [s.coord.lng, s.coord.lat] as [number, number],
        },
        properties: {
          id: s.id,
          type: s.type,
          title: (s.poi?.name || s.type).toString().toUpperCase(),
          subtitle: `${new Date(s.etaIso).toLocaleString()} • ${
            s.durationMin
          }m`,
        },
      })),
    }),
    [data]
  );

  const fitBounds: LngLatBoundsLike = useMemo(() => {
    const coords = [
      ...data.route.geometry.coordinates,
      ...data.stops.map((s) => [s.coord.lng, s.coord.lat] as [number, number]),
    ];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const min: [number, number] = [Math.min(...lons), Math.min(...lats)];
    const max: [number, number] = [Math.max(...lons), Math.max(...lats)];
    return [min, max];
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [TILE_URL],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      } as any,
      center: data.route.geometry.coordinates[0],
      zoom: 5,
    });
    mapRef.current = m;

    const addImg = (name: string, url: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          (m as any).addImage(name, img, { pixelRatio: 2 });
          resolve();
        };
        img.src = url;
      });

    m.on("load", () => {
      const svgDataUrl = (svg: string) =>
        `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

      const PIN_BLUE = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="#2563eb" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
  </svg>`);

      const PIN_ORANGE = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="#f59e0b" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
  </svg>`);

      const FUEL_CYAN = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="#06b6d4" d="M3 7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12H3V7Zm16.59 2.59L18 9v10a2 2 0 0 1-2 2h-1v-2h1V7a3 3 0 0 1 3-3h1v2h-1a1 1 0 0 0-1 1v2.59l1.29 1.3a1 1 0 0 1 .29.7V21h-2v-6.41l-.41-.41L19.59 9.6Z"/>
  </svg>`);

      const BED_RED = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="#ef4444" d="M3 7h2v4h14a3 3 0 0 1 3 3v3h-2v-2H3v2H1V7h2Zm6 0a2 2 0 1 1 0 4H5V7h4Z"/>
  </svg>`);

      const registerImage = (name: string, url: string): Promise<void> =>
        new Promise((resolve) => {
          // If it already exists, don’t re-add
          // @ts-expect-error maplibre hasImage at runtime
          if (m.hasImage && m.hasImage(name)) return resolve();
          m.loadImage(url, (err, image) => {
            if (err || !image) {
              console.error(`[map] loadImage failed for ${name}:`, err);
              return resolve(); // don’t block the rest
            }
            try {
              m.addImage(name, image, { pixelRatio: 2 });
            } catch (e) {
              // ignore “Image with this name already exists” etc.
            }
            resolve();
          });
        });

      const ensureSource = (id: string) => {
        if (!m.getSource(id)) {
          m.addSource(id, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
        }
      };

      const removeLayerIf = (id: string) => {
        if (m.getLayer(id)) m.removeLayer(id);
      };

      (async () => {
        console.log("[map] style loaded, registering images…");
        await Promise.all([
          registerImage("icon-pickup", PIN_BLUE),
          registerImage("icon-dropoff", PIN_ORANGE),
          registerImage("icon-fuel", FUEL_CYAN),
          registerImage("icon-rest", BED_RED),
        ]);

        ensureSource("route");
        ensureSource("stops");

        removeLayerIf("route-line");
        removeLayerIf("stops-dots");
        removeLayerIf("stops-labels");
        removeLayerIf("stops-icons");
        removeLayerIf("stops-circles-debug");

        m.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#2563eb", "line-width": 4 },
        });

        // Fallback circle layer (toggle to true for debugging)
        const DEBUG_CIRCLES = false;
        if (DEBUG_CIRCLES) {
          m.addLayer({
            id: "stops-circles-debug",
            type: "circle",
            source: "stops",
            paint: {
              "circle-radius": 6,
              "circle-color": "#111827",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff",
            },
          });
        }

        m.addLayer({
          id: "stops-icons",
          type: "symbol",
          source: "stops",
          layout: {
            "icon-image": [
              "match",
              ["get", "type"],
              "pickup",
              "icon-pickup",
              "dropoff",
              "icon-dropoff",
              "fuel",
              "icon-fuel",
              "rest",
              "icon-rest",
              /* default */ "icon-pickup",
            ],
            "icon-size": 0.9,
            "icon-allow-overlap": true,
            "text-field": ["get", "type"],
            "text-size": 11,
            "text-offset": [0, 1.35],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#111827",
            "text-halo-width": 0.6,
            "text-halo-color": "rgba(255,255,255,0.85)",
          },
        });

        m.on("click", "stops-icons", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const [lng, lat] = (f.geometry as any).coordinates as [
            number,
            number
          ];
          const p = f.properties as any;
          const title = (p?.title || p?.type || "").toString().toUpperCase();
          const subtitle = (p?.subtitle || "").toString();
          new maplibregl.Popup({ closeOnMove: true })
            .setLngLat([lng, lat])
            .setHTML(
              `<strong>${title}</strong><br/><span style="font-size:12px;color:#374151">${subtitle}</span>`
            )
            .addTo(m);
        });

        m.on(
          "mouseenter",
          "stops-icons",
          () => (m.getCanvas().style.cursor = "pointer")
        );
        m.on(
          "mouseleave",
          "stops-icons",
          () => (m.getCanvas().style.cursor = "")
        );

        console.log("[map] stops/route layers added; ready for data.");
      })();
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [routeGeo, stopsGeo, fitBounds, data]);

  // Update sources when data changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    const route = m.getSource("route") as any;
    const stops = m.getSource("stops") as any;
    route?.setData(routeGeo);
    stops?.setData(stopsGeo);
    m.fitBounds(fitBounds, { padding: 48, duration: 300 });
  }, [routeGeo, stopsGeo, fitBounds]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
