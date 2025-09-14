import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  Stack,
  TextField,
  Typography,
  Chip,
  Divider,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationAutocomplete from "./LocationAutocomplete";
import PlaceIcon from "@mui/icons-material/Place";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { TripCalcResponse } from "../lib/types";
import { calculateTrip } from "../lib/trips";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import { IconButton, Tooltip } from "@mui/material";

export type TripFormValues = {
  currentLocation: string;
  currentLat?: number;
  currentLng?: number;
  pickupLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLocation: string;
  dropoffLat?: number;
  dropoffLng?: number;
  currentCycleHours: number;
  notes: string;
};

type Props = {
  defaultValues?: Partial<TripFormValues>;
  onCalculated: (resp: TripCalcResponse, values: TripFormValues) => void;
  onClear?: () => void;
};

export default function TripForm({
  defaultValues,
  onCalculated,
  onClear,
}: Props) {
  const [formData, setFormData] = useState<TripFormValues>({
    currentLocation: "",
    pickupLocation: "",
    dropoffLocation: "",
    currentCycleHours: 0,
    notes: "",
    ...defaultValues,
  });

  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof TripFormValues, v: any) =>
    setFormData((p) => ({ ...p, [k]: v }));

  const validate = () => {
    if (
      !formData.currentLocation.trim() ||
      formData.currentLat == null ||
      formData.currentLng == null
    )
      return "Select a valid Current Location from suggestions";
    if (
      !formData.pickupLocation.trim() ||
      formData.pickupLat == null ||
      formData.pickupLng == null
    )
      return "Select a valid Pickup Location from suggestions";
    if (
      !formData.dropoffLocation.trim() ||
      formData.dropoffLat == null ||
      formData.dropoffLng == null
    )
      return "Select a valid Drop-off Location from suggestions";
    if (formData.currentCycleHours < 0 || formData.currentCycleHours > 70)
      return "Current cycle hours must be between 0 and 70";
    return null;
  };

  const cycleBadge = () => {
    const h = formData.currentCycleHours;
    if (h >= 60) return { color: "error", text: "Critical - Near Limit" };
    if (h >= 50) return { color: "warning", text: "Warning - High Hours" };
    return { color: "primary", text: "Good - Within Limits" };
  };

  const calculate = async () => {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setIsCalculating(true);
    try {
      const payload = {
        currentLocation: {
          lat: formData.currentLat!,
          lng: formData.currentLng!,
        },
        pickupLocation: { lat: formData.pickupLat!, lng: formData.pickupLng! },
        dropoffLocation: {
          lat: formData.dropoffLat!,
          lng: formData.dropoffLng!,
        },
        currentCycleUsedHours: formData.currentCycleHours,
        startTimeIso: new Date().toISOString(),
      };
      const resp = await calculateTrip(payload);
      onCalculated(resp, formData);
    } catch (e: any) {
      setError(e?.message || "Failed to calculate route");
    } finally {
      setIsCalculating(false);
    }
  };

  const clear = () => {
    setFormData({
      currentLocation: "",
      pickupLocation: "",
      dropoffLocation: "",
      currentCycleHours: 0,
      notes: "",
    });
    setError(null);
    onClear?.();
  };

  return (
    <Box sx={{ p: 2.5 }}>
      <Stack alignItems="center" spacing={1.5} mb={4} textAlign="center">
        <Stack direction="row" alignItems="center" spacing={1}>
          <LocalShippingIcon sx={{ color: "primary.main", fontSize: 32 }} />
          <Typography variant="h6" fontWeight={400}>
            Create New Trip
          </Typography>
        </Stack>
        <Typography variant="subtitle1" fontSize={14} color="text.secondary">
          Plan your route and generate ELD-compliant logs
        </Typography>
      </Stack>
      <Stack>
        <Divider sx={{ mb: 4 }}></Divider>
      </Stack>

      <Stack spacing={2.5}>
        <Stack spacing={0.75}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <PlaceIcon fontSize="small" /> Current Location
          </Typography>
          <Box sx={{ display: "flex", gap: 2, width: "100%" }}>
            <LocationAutocomplete
              value={formData.currentLocation}
              onChange={(v, sel) => {
                set("currentLocation", v);
                if (sel?.lat && sel?.lon) {
                  set("currentLat", Number(sel.lat));
                  set("currentLng", Number(sel.lon));
                }
              }}
              placeholder="Dallas, TX"
              size="small"
            />
            <Tooltip title="Use my current location">
              <IconButton
                color="primary"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      const lat = pos.coords.latitude;
                      const lng = pos.coords.longitude;
                      set("currentLat", lat);
                      set("currentLng", lng);
                      set(
                        "currentLocation",
                        `Current Location (${lat.toFixed(4)}, ${lng.toFixed(
                          4
                        )})`
                      );
                    },
                    () => {}
                  );
                }}
                sx={{ alignSelf: "flex-end", mb: 0.25 }}
                size="small"
              >
                <MyLocationIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>

        <Grid container spacing={1.5}>
          <Grid item xs={12} md={6} sx={{ flex: 1 }}>
            <Stack spacing={0.75}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <PlaceIcon fontSize="small" color="secondary" /> Pickup Location
              </Typography>
              <LocationAutocomplete
                value={formData.pickupLocation}
                onChange={(v, sel) => {
                  set("pickupLocation", v);
                  if (sel?.lat && sel?.lon) {
                    set("pickupLat", Number(sel.lat));
                    set("pickupLng", Number(sel.lon));
                  }
                }}
                placeholder="Houston, TX"
                size="small"
              />
            </Stack>
          </Grid>
          <Grid item xs={12} md={6} sx={{ flex: 1 }}>
            <Stack spacing={0.75}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <PlaceIcon fontSize="small" color="success" /> Drop-off Location
              </Typography>
              <LocationAutocomplete
                value={formData.dropoffLocation}
                onChange={(v, sel) => {
                  set("dropoffLocation", v);
                  if (sel?.lat && sel?.lon) {
                    set("dropoffLat", Number(sel.lat));
                    set("dropoffLng", Number(sel.lon));
                  }
                }}
                placeholder="Miami, FL"
                size="small"
              />
            </Stack>
          </Grid>
        </Grid>

        <Stack spacing={0.75}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <AccessTimeIcon fontSize="small" /> Current Cycle Hours (70/8)
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              type="number"
              inputProps={{ min: 0, max: 70 }}
              placeholder="0"
              value={formData.currentCycleHours}
              onChange={(e) =>
                set("currentCycleHours", Number.parseInt(e.target.value) || 0)
              }
              size="small"
              fullWidth
            />
            <Chip color={cycleBadge().color as any} label={cycleBadge().text} />
          </Stack>
        </Stack>

        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            Notes (optional)
          </Typography>
          <TextField
            value={formData.notes}
            onChange={(e) => set("notes", e.target.value)}
            size="small"
            multiline
            minRows={3}
            fullWidth
          />
        </Stack>

        {error && (
          <Alert
            severity="error"
            icon={<WarningAmberIcon />}
            sx={{ borderRadius: 2 }}
          >
            {error}
          </Alert>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            variant="contained"
            onClick={calculate}
            disabled={isCalculating}
            fullWidth
          >
            {isCalculating ? "Calculating…" : "Calculate Route"}
          </Button>
        </Stack>
        <Stack>
          <Button variant="outlined" onClick={clear} fullWidth>
            Clear Form
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
