import { useEffect, useMemo, useRef, useCallback } from "react";
import maplibregl, { type LngLatBoundsLike, type Map } from "maplibre-gl";
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

  const svgDataUrl = useCallback(
    (svg: string) =>
      `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    []
  );

  const getIconDataUrls = useCallback(() => {
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
    return { PIN_BLUE, PIN_ORANGE, FUEL_CYAN, BED_RED };
  }, [svgDataUrl]);

  const registerImage = useCallback(
    async (m: Map, name: string, url: string) => {
      const anyMap = m as any;
      if (anyMap.hasImage?.(name)) return;
      const img = await anyMap.loadImage(url);
      anyMap.addImage(name, img, { pixelRatio: 2 });
    },
    []
  );

  const ensureSources = useCallback((m: Map) => {
    if (!m.getSource("route")) {
      m.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!m.getSource("stops")) {
      m.addSource("stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
  }, []);

  const addLayers = useCallback((m: Map) => {
    if (m.getLayer("route-line")) m.removeLayer("route-line");
    if (m.getLayer("stops-icons")) m.removeLayer("stops-icons");

    m.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#2563eb", "line-width": 4 },
    });

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
          "icon-pickup",
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
  }, []);

  const updateDataAndFit = useCallback(
    (m: Map) => {
      const routeSrc = m.getSource("route") as any;
      const stopsSrc = m.getSource("stops") as any;
      routeSrc?.setData(routeGeo);
      stopsSrc?.setData(stopsGeo);
      m.fitBounds(fitBounds, { padding: 48, duration: 300 });
    },
    [routeGeo, stopsGeo, fitBounds]
  );

  const initMap = useCallback(
    async (el: HTMLDivElement) => {
      const center = data.route.geometry.coordinates[0];

      const m = new maplibregl.Map({
        container: el,
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
        center,
        zoom: 5,
      });

      mapRef.current = m;

      m.on("load", async () => {
        const { PIN_BLUE, PIN_ORANGE, FUEL_CYAN, BED_RED } = getIconDataUrls();
        await Promise.all([
          registerImage(m, "icon-pickup", PIN_BLUE),
          registerImage(m, "icon-dropoff", PIN_ORANGE),
          registerImage(m, "icon-fuel", FUEL_CYAN),
          registerImage(m, "icon-rest", BED_RED),
        ]);
        ensureSources(m);
        addLayers(m);
        updateDataAndFit(m);
      });
    },
    [
      addLayers,
      data.route.geometry.coordinates,
      ensureSources,
      getIconDataUrls,
      registerImage,
      updateDataAndFit,
    ]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    initMap(containerRef.current);
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initMap]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (m.isStyleLoaded()) {
      updateDataAndFit(m);
    } else {
      const onLoad = () => {
        updateDataAndFit(m);
        m.off("load", onLoad);
      };
      m.on("load", onLoad);
    }
  }, [updateDataAndFit]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
