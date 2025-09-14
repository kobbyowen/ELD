import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type LngLatBoundsLike, Map } from "maplibre-gl";
import type { TripCalcResponse } from "../lib/types";

type Props = { data: TripCalcResponse; height?: number };

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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

    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: routeGeo });
      m.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });

      m.addSource("stops", { type: "geojson", data: stopsGeo });
      m.addLayer({
        id: "stops-circles",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "type"],
            "pickup",
            "#10b981",
            "dropoff",
            "#f59e0b",
            "break",
            "#22c55e",
            "rest",
            "#ef4444",
            "fuel",
            "#06b6d4",
            "#64748b",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      m.addLayer({
        id: "stops-labels",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "type"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: { "text-color": "#111827" },
      });

      m.fitBounds(fitBounds, { padding: 48, duration: 0 });

      m.on("click", "stops-circles", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const [lng, lat] = (f.geometry as any).coordinates as [number, number];
        const { title, subtitle } = f.properties as any;
        new maplibregl.Popup({ closeOnMove: true })
          .setLngLat([lng, lat])
          .setHTML(
            `<strong>${title}</strong><br/><span style="font-size:12px;color:#374151">${subtitle}</span>`
          )
          .addTo(m);
      });

      m.getCanvas().style.outline = "none";
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
