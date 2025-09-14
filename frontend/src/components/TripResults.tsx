import { useMemo } from "react";
import { Box, Stack, Typography, Divider, Button, Alert } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { TripCalcResponse } from "../lib/types";
import StopsTimeline from "./StopsTimeline";

type Props = {
  data: TripCalcResponse;
  onBack: () => void;
  onLogTrip: () => void;
  error?: string | null;
  isSaving?: boolean;
};

export default function TripResults({
  data,
  onBack,
  onLogTrip,
  error,
  isSaving,
}: Props) {
  const summary = useMemo(() => {
    const miles = data.route.distance_m / 1609.344;
    const totalMin = Math.round(data.route.duration_s / 60);
    return {
      miles: Math.round(miles * 10) / 10,
      totalMin,
      hh: Math.floor(totalMin / 60),
      mm: totalMin % 60,
    };
  }, [data]);

  return (
    <Box sx={{ p: 2.25 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Button
          onClick={onBack}
          startIcon={<ArrowBackIosNewIcon fontSize="small" />}
          size="small"
        >
          Back
        </Button>
      </Stack>

      <Stack spacing={0.25} sx={{ mb: 1.5 }}>
        <Typography variant="h6" fontWeight={800}>
          Trip Summary
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {summary.miles.toLocaleString()} miles • ~ {summary.hh}h {summary.mm}m
        </Typography>
      </Stack>

      <Divider sx={{ my: 1 }} />

      <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
        Planned Stops & Rests
      </Typography>
      <StopsTimeline stops={data.stops as any} />

      {error && (
        <Alert
          severity="error"
          icon={<WarningAmberIcon />}
          sx={{ borderRadius: 2, mt: 1.5 }}
        >
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          onClick={onLogTrip}
          disabled={isSaving}
          fullWidth
        >
          {isSaving ? "Saving…" : "Log This Trip"}
        </Button>
      </Stack>
    </Box>
  );
}
