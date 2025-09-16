import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useAuth } from "../auth/AuthContext";
import { Navigate } from "react-router-dom";
import TripForm, { type TripFormValues } from "../components/TripInputForm";
import TripResults from "../components/TripResults";
import type { TripCalcResponse } from "../lib/types";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import HomeIcon from "@mui/icons-material/Home";
import { useNavigate } from "react-router-dom";
import { logTrip as apiLogTrip } from "../lib/trips";

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
  const navigate = useNavigate();

  const [calcData, setCalcData] = useState<TripCalcResponse | null>(null);
  const [values, setValues] = useState<TripFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [open, setOpen] = useState(true);

  const togglePanel = useCallback(() => setOpen((o) => !o), []);
  const backToForm = useCallback(() => setCalcData(null), []);
  const onCalculated = useCallback(
    (resp: TripCalcResponse, v: TripFormValues) => {
      setCalcData(resp);
      setValues(v);
    },
    []
  );

  const goHome = useCallback(() => navigate("/dashboard"), [navigate]);

  const logTrip = async () => {
    if (!calcData?.draft_id) {
      setError("Missing draft id. Please calculate again.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      return await apiLogTrip({
        draft_id: calcData.draft_id,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to log trip");
    } finally {
      setIsSaving(false);
    }
  };

  const routeFeature = useMemo(
    () =>
      calcData
        ? {
            type: "Feature" as const,
            geometry: calcData.route.geometry,
            properties: {},
          }
        : {
            type: "Feature" as const,
            geometry: { type: "LineString", coordinates: [] as any[] },
            properties: {},
          },
    [calcData]
  );

  const stopsFeatureCollection = useMemo(
    () =>
      calcData
        ? {
            type: "FeatureCollection" as const,
            features: calcData.stops.map((s) => ({
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [s.coord.lng, s.coord.lat] as [number, number],
              },
              properties: {
                id: s.id,
                type: s.type,
                title: (s.poi?.name || s.type).toString(),
                subtitle: `${new Date(s.etaIso).toLocaleString()} • ${
                  s.durationMin
                }m`,
              },
            })),
          }
        : { type: "FeatureCollection" as const, features: [] },
    [calcData]
  );

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
      if (!m.getSource("route")) {
        m.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!m.getLayer("route-line")) {
        m.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: { "line-color": "#2563eb", "line-width": 4 },
        });
      }
      if (!m.getSource("stops")) {
        m.addSource("stops", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!m.getLayer("stops-dots")) {
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
      }
      if (!m.getLayer("stops-labels")) {
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
      }
    });

    mapRef.current = m;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const route = m.getSource("route") as any;
    const stops = m.getSource("stops") as any;
    route?.setData(routeFeature);
    stops?.setData(stopsFeatureCollection);

    if (calcData) {
      const coords = [
        ...calcData.route.geometry.coordinates,
        ...calcData.stops.map(
          (s) => [s.coord.lng, s.coord.lat] as [number, number]
        ),
      ];
      if (coords.length) {
        const min: [number, number] = [
          calcData.places.current.lng,
          calcData.places.current.lat,
        ];
        const max: [number, number] = [
          calcData.places.dropoff.lng,
          calcData.places.dropoff.lat,
        ];

        m.fitBounds([min, max], { padding: 56, duration: 400 });
      }
    }
  }, [calcData, routeFeature, stopsFeatureCollection]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !panelRef.current) return;
    const onDone = () => m.resize();
    panelRef.current.addEventListener("transitionend", onDone);
    return () => panelRef.current?.removeEventListener("transitionend", onDone);
  }, []);

  return (
    <Box sx={{ position: "fixed", inset: 0 }}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />

      <Box
        ref={panelRef}
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 2,
          width: { xs: "100%", sm: "420px", md: "34vw" },
          maxWidth: 450,
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
        onClick={togglePanel}
        size="small"
        sx={{
          position: "fixed",
          top: "50%",
          transform: open
            ? "translateY(-50%) translateX(-50%)"
            : "translateY(-50%) ",
          left: open
            ? {
                xs: "min(100vw, 450px)",
                sm: "420px",
                md: "min(34vw, 450px)",
              }
            : 8,
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

      <Tooltip title="Back to Dashboard">
        <IconButton
          onClick={goHome}
          size="small"
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 0,
            bgcolor: (t) =>
              t.palette.mode === "light" ? "white" : "rgba(0,0,0,0.7)",
            border: (t) => `1px solid ${t.palette.divider}`,
            boxShadow: 2,
            "&:hover": {
              bgcolor: (t) =>
                t.palette.mode === "light" ? "grey.50" : "rgba(0,0,0,0.8)",
            },
          }}
          aria-label="Go to dashboard"
        >
          <HomeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
