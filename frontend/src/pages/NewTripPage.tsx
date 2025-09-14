import { useEffect, useRef, useState } from "react";
import { Box, IconButton } from "@mui/material";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useAuth } from "../auth/AuthContext";
import { Navigate } from "react-router-dom";
import TripForm, { type TripFormValues } from "../components/TripInputForm";
import TripResults from "../components/TripResults";
import type { TripCalcResponse } from "../lib/types";
import { calculateTrip } from "../lib/trips";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function NewTripPage() {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  return <PlannerScreen />;
}

function PlannerScreen() {
  const mapRef = useRef<Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [calcData, setCalcData] = useState<TripCalcResponse | null>(null);
  const [values, setValues] = useState<TripFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [open, setOpen] = useState(true);
  const panelWidth = { xs: "100%", sm: 420, md: 0.34 * window.innerWidth };
  const toggle = () => setOpen((o) => !o);

  useEffect(() => {
    if (!mapEl.current) return;
    const m = new maplibregl.Map({
      container: mapEl.current,
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
      center: [-96, 37.8],
      zoom: 4,
    });
    m.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right"
    );
    m.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "bottom-right"
    );
    mapRef.current = m;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          m.easeTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 14,
            duration: 600,
          }),
        () => {}
      );
    }

    m.on("load", () => {
      m.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });

      m.addSource("stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "stops-dots",
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
          "circle-stroke-color": "#fff",
        },
      });
      m.addLayer({
        id: "stops-labels",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "type"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
        },
        paint: { "text-color": "#111827" },
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !calcData) return;
    (m.getSource("route") as any)?.setData({
      type: "Feature",
      geometry: calcData.route.geometry,
      properties: {},
    });
    (m.getSource("stops") as any)?.setData({
      type: "FeatureCollection",
      features: calcData.stops.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.coord.lng, s.coord.lat] },
        properties: {
          id: s.id,
          type: s.type,
          title: (s.poi?.name || s.type).toString(),
          subtitle: `${new Date(s.etaIso).toLocaleString()} • ${
            s.durationMin
          }m`,
        },
      })),
    });

    const coords = [
      ...calcData.route.geometry.coordinates,
      ...calcData.stops.map(
        (s) => [s.coord.lng, s.coord.lat] as [number, number]
      ),
    ];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const min: [number, number] = [Math.min(...lons), Math.min(...lats)];
    const max: [number, number] = [Math.max(...lons), Math.max(...lats)];
    m.fitBounds([min, max], { padding: 56, duration: 400 });
  }, [calcData]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !panelRef.current) return;
    const onDone = () => m.resize();
    panelRef.current.addEventListener("transitionend", onDone);
    return () => panelRef.current?.removeEventListener("transitionend", onDone);
  }, []);

  const onCalculated = (resp: TripCalcResponse, v: TripFormValues) => {
    setCalcData(resp);
    setValues(v);
  };
  const backToForm = () => setCalcData(null);

  const logTrip = async () => {
    setIsSaving(true);
    try {
      // TODO: persist trip
    } catch (e: any) {
      setError(e?.message || "Failed to save trip");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLeft = open ? 0 : -1; // keep in DOM when closed for smooth animation

  return (
    <Box sx={{ position: "fixed", inset: 0 }}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />

      <Box
        ref={panelRef}
        sx={{
          position: "fixed",
          top: 0,
          left: handleLeft,
          height: "100vh",
          width: { xs: "100%", sm: "420px", md: "34vw" },
          maxWidth: 520,
          bgcolor: (t) =>
            t.palette.mode === "light"
              ? "rgba(255,255,255,0.96)"
              : "rgba(17,24,39,0.92)",
          backdropFilter: "saturate(180%) blur(6px)",
          borderRight: (t) => `1px solid ${t.palette.divider}`,
          boxShadow: 3,
          overflowY: "auto",
          transform: `translateX(${open ? "0%" : "-100%"})`,
          transition: "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
        {!calcData ? (
          <TripForm
            defaultValues={values || undefined}
            onCalculated={onCalculated}
          />
        ) : (
          <TripResults
            data={calcData}
            onBack={backToForm}
            onLogTrip={logTrip}
            error={error}
            isSaving={isSaving}
          />
        )}
      </Box>

      <IconButton
        onClick={toggle}
        size="small"
        sx={{
          position: "fixed",
          top: "50%",
          transform: "translateY(-50%)",
          left: open ? "500px" : 8,
          transition: "left 360ms cubic-bezier(0.22, 1, 0.36, 1)",
          bgcolor: (t) => (t.palette.mode === "light" ? "white" : "grey.900"),
          border: (t) => `1px solid ${t.palette.divider}`,
          boxShadow: 3,
          zIndex: 2,
          "&:hover": {
            bgcolor: (t) =>
              t.palette.mode === "light" ? "grey.50" : "grey.800",
          },
        }}
        aria-label={open ? "Collapse panel" : "Expand panel"}
      >
        {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </IconButton>
    </Box>
  );
}
