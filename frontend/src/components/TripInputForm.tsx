import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Stack,
  TextField,
  Typography,
  Chip,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationAutocomplete from "./LocationAutocomplete";
import PlaceIcon from "@mui/icons-material/Place";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { RoutePlanningService } from "../lib/route-planning";
import type { RouteData, TripCalcResponse } from "../lib/types";
import { RouteDisplay } from "./RouteDisplay";
import { calculateTrip } from "../lib/trips";
import { useAuth } from "../auth/AuthContext";
import TripMap from "./TripMap";

type Props = {
  onTripCreated?: (tripId: string) => void; // reserved for when we persist later
};

export function TripInputForm({ onTripCreated }: Props) {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    currentLocation: "",
    currentLat: undefined as number | undefined,
    currentLng: undefined as number | undefined,
    pickupLocation: "",
    pickupLat: undefined as number | undefined,
    pickupLng: undefined as number | undefined,
    dropoffLocation: "",
    dropoffLat: undefined as number | undefined,
    dropoffLng: undefined as number | undefined,
    currentCycleHours: 0,
    notes: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calcData, setCalcData] = useState<TripCalcResponse | null>(null);

  const handleChange = (field: keyof typeof formData, value: any) =>
    setFormData((p) => ({ ...p, [field]: value }));

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

  const handleCalculateRoute = async () => {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setIsCalculatingRoute(true);
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
      setCalcData(resp);
    } catch (e: any) {
      setError(e?.message || "Failed to calculate route");
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    if (!calcData) return setError("Please calculate the route first.");
    setIsLoading(true);
    try {
      // TODO: POST to your trips endpoint to persist the trip; for now just invoke callback
      onTripCreated?.("trip-id-placeholder");
    } catch (e: any) {
      setError(e?.message || "Failed to create trip");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div>
      <Box sx={{ maxWidth: 720, mx: "auto", borderRadius: 2 }}>
        <CardContent sx={{ pt: 2 }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <Stack spacing={0.75}>
                <LocationAutocomplete
                  value={formData.currentLocation}
                  onChange={(val, sel) => {
                    handleChange("currentLocation", val);
                    if (sel?.lat && sel?.lon) {
                      handleChange("currentLat", Number(sel.lat));
                      handleChange("currentLng", Number(sel.lon));
                    }
                  }}
                  placeholder="Dallas, TX"
                  size="small"
                  labelText="Current Location"
                  labelIcon={<PlaceIcon fontSize="small" />}
                />
              </Stack>

              <Grid container spacing={2}>
                <Grid sx={{ xs: 12, md: 6, flex: 1 }}>
                  <Stack spacing={0.75}>
                    <LocationAutocomplete
                      value={formData.pickupLocation}
                      onChange={(val, sel) => {
                        handleChange("pickupLocation", val);
                        if (sel?.lat && sel?.lon) {
                          handleChange("pickupLat", Number(sel.lat));
                          handleChange("pickupLng", Number(sel.lon));
                        }
                      }}
                      placeholder="Houston, TX"
                      size="small"
                      labelText="Pickup Location"
                      labelIcon={
                        <PlaceIcon fontSize="small" color="secondary" />
                      }
                    />
                  </Stack>
                </Grid>
                <Grid sx={{ xs: 12, md: 6, flex: 1 }}>
                  <Stack spacing={0.75}>
                    <LocationAutocomplete
                      value={formData.dropoffLocation}
                      onChange={(val, sel) => {
                        handleChange("dropoffLocation", val);
                        if (sel?.lat && sel?.lon) {
                          handleChange("dropoffLat", Number(sel.lat));
                          handleChange("dropoffLng", Number(sel.lon));
                        }
                      }}
                      placeholder="Miami, FL"
                      size="small"
                      labelText="Drop-off Location"
                      labelIcon={<PlaceIcon fontSize="small" color="success" />}
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
                  <AccessTimeIcon fontSize="small" /> Current Cycle Hours
                  (70-hour/8-day limit)
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <TextField
                    type="number"
                    inputProps={{ min: 0, max: 70 }}
                    placeholder="0"
                    value={formData.currentCycleHours}
                    onChange={(e) =>
                      handleChange(
                        "currentCycleHours",
                        Number.parseInt(e.target.value) || 0
                      )
                    }
                    size="small"
                    fullWidth
                  />
                  <Chip
                    color={cycleBadge().color as any}
                    label={cycleBadge().text}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Enter your current hours used in the 8-day cycle (max 70
                  hours)
                </Typography>
              </Stack>

              <Stack spacing={0.75}>
                <Typography variant="caption" color="text.secondary">
                  Additional Notes (Optional)
                </Typography>
                <TextField
                  placeholder="Any special instructions or notes for this trip…"
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
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

              {/* Actions */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <Button
                  variant="outlined"
                  onClick={handleCalculateRoute}
                  disabled={isCalculatingRoute}
                  fullWidth
                >
                  {isCalculatingRoute ? "Calculating…" : "Calculate Route"}
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isLoading || !calcData}
                  fullWidth
                >
                  {isLoading ? "Creating Trip…" : "Log Trip"}
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setFormData({
                      currentLocation: "",
                      currentLat: undefined,
                      currentLng: undefined,
                      pickupLocation: "",
                      pickupLat: undefined,
                      pickupLng: undefined,
                      dropoffLocation: "",
                      dropoffLat: undefined,
                      dropoffLng: undefined,
                      currentCycleHours: 0,
                      notes: "",
                    });
                    setError(null);
                    setCalcData(null);
                  }}
                  fullWidth
                >
                  Clear
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Box>

      {calcData && (
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
          <RouteDisplay data={calcData} />
          <Box sx={{ mt: 2 }}>
            <TripMap data={calcData} height={480} />
          </Box>
        </Box>
      )}
    </div>
  );
}
