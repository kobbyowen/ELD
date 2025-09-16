import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import RoomIcon from "@mui/icons-material/Room";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MapIcon from "@mui/icons-material/Map";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ImageIcon from "@mui/icons-material/Image";
import DescriptionIcon from "@mui/icons-material/Description";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import maplibregl, { Map as MlMap, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { apiFetch } from "../lib/api";
import type { TripCalcResponse } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import StopsTimeline from "../components/StopsTimeline";
import HosLogGrid from "../components/HosGrid";

function stripFirstName(locationName: string): string {
  if (!locationName) return locationName;
  if (locationName.toLowerCase().includes("location")) return locationName;

  return locationName.split(",")[0].trim();
}

type TripFileRef = {
  page_index: number;
  html_url: string;
  pdf_url: string;
  png_url: string;
};

export type TripDetail = {
  id: string;
  user: number | string;
  created_at: string;
  calc_payload: TripCalcResponse | null;
  extras?: Record<string, any> | null;
  files?: TripFileRef[];
};

function MiniTripMap({
  data,
  height = 260,
}: {
  data: TripCalcResponse;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

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
        properties: { id: s.id, type: s.type },
      })),
    }),
    [data]
  );

  const fitBounds: LngLatBoundsLike = useMemo(() => {
    const min: [number, number] = [
      data.places.current.lng,
      data.places.current.lat,
    ];
    const max: [number, number] = [
      data.places.dropoff.lng,
      data.places.dropoff.lat,
    ];

    return [min, max];
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      } as any,
      center: data.route.geometry.coordinates[0],
      zoom: 6,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      // sources
      map.addSource("route", { type: "geojson", data: routeGeo as any });
      map.addSource("stops", { type: "geojson", data: stopsGeo as any });

      // line
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#2563eb", "line-width": 3 },
      });

      // points
      map.addLayer({
        id: "stops-dots",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": 5,
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

      map.fitBounds(fitBounds, { padding: 32, duration: 0 });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [routeGeo, stopsGeo, fitBounds, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const route = map.getSource("route") as any;
    const stops = map.getSource("stops") as any;
    route?.setData(routeGeo);
    stops?.setData(stopsGeo);
    map.fitBounds(fitBounds, { padding: 32, duration: 250 });
  }, [routeGeo, stopsGeo, fitBounds]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}

export default function TripViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/trips/${id}`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as TripDetail;
        if (active) setTrip(data);
      } catch (e: any) {
        if (active) setErr(e?.message || "Failed to load trip");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const summary = useMemo(() => {
    const calc = trip?.calc_payload;
    if (!calc) return null;
    const miles = calc.route.distance_m / 1609.344;
    const totalMin = Math.round(calc.route.duration_s / 60);
    return {
      miles: Math.round(miles * 10) / 10,
      hh: Math.floor(totalMin / 60),
      mm: totalMin % 60,
      from: stripFirstName(
        calc?.places?.current?.name || trip?.extras?.places?.pickup?.name
      ),
      to: stripFirstName(
        calc?.places?.dropoff?.name || trip?.extras?.places?.dropoff?.name
      ),
      date:
        trip?.extras?.log_date ||
        (trip?.created_at
          ? new Date(trip.created_at).toISOString().slice(0, 10)
          : ""),
    };
  }, [trip]);

  const firstFile = useMemo<TripFileRef | undefined>(
    () => trip?.files?.slice().sort((a, b) => a.page_index - b.page_index)[0],
    [trip]
  );

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
          <CircularProgress />
        </Stack>
      </Container>
    );
  }
  if (err) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Stack spacing={2}>
          <Button
            startIcon={<ArrowBackIosNewIcon fontSize="small" />}
            onClick={() => navigate(-1)}
            size="small"
          >
            Back
          </Button>
          <Alert severity="error">{err}</Alert>
        </Stack>
      </Container>
    );
  }
  if (!trip) return null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        mb={2}
      >
        <Button
          startIcon={<ArrowBackIosNewIcon fontSize="small" />}
          component={RouterLink}
          to="/trips"
          size="small"
        >
          Back to Trips
        </Button>

        <Stack direction="row" spacing={1}>
          {firstFile?.pdf_url && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<PictureAsPdfIcon />}
              component="a"
              href={firstFile.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              PDF
            </Button>
          )}
          {firstFile?.png_url && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ImageIcon />}
              component="a"
              href={firstFile.png_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Image
            </Button>
          )}
          {firstFile?.html_url && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<DescriptionIcon />}
              component="a"
              href={firstFile.html_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              HTML
            </Button>
          )}
        </Stack>
      </Stack>

      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: (t) => `1px solid ${t.palette.divider}`,
          mb: 2,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <LocalShippingIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Trip Details
          </Typography>
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6, lg: 7 }}>
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Trip ID
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{trip.id}</Typography>
            </Stack>

            <Stack spacing={0.5} mt={1.5}>
              <Typography variant="body2" color="text.secondary">
                Date
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                {summary?.date || "—"}
              </Typography>
            </Stack>

            <Stack
              direction="row"
              spacing={2.5}
              alignItems="center"
              mt={1.5}
              flexWrap="wrap"
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <RoomIcon color="action" fontSize="small" />
                <Typography variant="body2">
                  {summary?.from || "—"} → {summary?.to || "—"}
                </Typography>
              </Stack>
              {summary && (
                <>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <RoomIcon color="action" fontSize="small" />
                    <Typography variant="body2">
                      {summary.miles.toLocaleString()} mi
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AccessTimeIcon color="action" fontSize="small" />
                    <Typography variant="body2">
                      ~{summary.hh}h {summary.mm}m
                    </Typography>
                  </Stack>
                </>
              )}
              <Chip
                size="small"
                label={
                  user?.first_name
                    ? `Carrier: ${user.first_name}`
                    : "Carrier: —"
                }
              />
            </Stack>
            {trip.calc_payload?.stops && (
              <Box sx={{ zoom: 0.7, maxHeight: 200, overflow: "auto", pt: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Stops Timeline
                </Typography>
                <StopsTimeline stops={trip.calc_payload?.stops} />
              </Box>
            )}
          </Grid>

          <Grid
            size={{ xs: 12, md: 6, lg: 5 }}
            sx={{ justifyContent: "center", gap: 20 }}
          >
            {trip.calc_payload ? (
              <Box
                sx={{
                  borderRadius: 2,
                  overflow: "hidden",
                  border: (t) => `1px solid ${t.palette.divider}`,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    px: 1.25,
                    py: 0.75,
                    borderBottom: (t) => `1px solid ${t.palette.divider}`,
                    width: 600,
                  }}
                >
                  <MapIcon color="disabled" fontSize="small" />
                  <Typography variant="caption" color="text.secondary">
                    Route Overview
                  </Typography>
                </Box>
                <MiniTripMap data={trip.calc_payload} />
              </Box>
            ) : (
              <Alert severity="warning" sx={{ mt: 1 }}>
                No route found for this trip.
              </Alert>
            )}
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box
        sx={{
          borderRadius: 2,
          border: (t) => `1px solid ${t.palette.divider}`,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.75,
            borderBottom: (t) => `1px solid ${t.palette.divider}`,
          }}
        >
          <DescriptionIcon color="disabled" fontSize="small" />
          <Typography variant="caption" color="text.secondary">
            Daily Log
          </Typography>
        </Box>

        {firstFile?.html_url ? (
          <Box sx={{ width: "100%", height: { xs: 900, md: 1000 } }}>
            <iframe
              title="Daily Log"
              src={firstFile.html_url}
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                background: "#fff",
              }}
            />
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            <TripHosLogs trip={trip} />
          </Box>
        )}
      </Box>
    </Container>
  );
}

function TripHosLogs({ trip }: { trip?: TripDetail }) {
  if (!trip?.calc_payload?.dayBuckets?.length) return null;

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={4}>
        {trip.calc_payload.dayBuckets.map((day, idx) => (
          <Box key={`${day.date}-${idx}`}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {day.date}
            </Typography>
            <HosLogGrid day={day} width={2000} height={560} showTitle={false} />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
