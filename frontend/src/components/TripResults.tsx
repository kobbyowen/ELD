import { useMemo, useCallback, memo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Divider,
  Button,
  Alert,
  Link,
} from "@mui/material";
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
  const [trip, setTrip] = useState<any>();
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

  const handleBack = useCallback(() => onBack(), [onBack]);
  const handleLogTrip = useCallback(async () => {
    const trip = await onLogTrip();
    console.log("MMMM ", trip);
    setTrip(trip);
  }, [onLogTrip]);

  console.log({ trip });

  return (
    <Box sx={{ p: 2.25 }}>
      <Header onBack={handleBack} />

      <TripSummary
        miles={summary.miles}
        hours={summary.hh}
        minutes={summary.mm}
      />

      <Divider sx={{ my: 1 }} />

      <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
        Planned Stops & Rests
      </Typography>
      <StopsTimeline stops={data.stops as any} />

      <ErrorAlert error={error} />
      {trip && (
        <Alert severity="success" sx={{ borderRadius: 2, mt: 1.5 }}>
          Trip has been logged successfully.
          <Link href={`/trips/${trip.id}`}>View Trip</Link>
        </Alert>
      )}

      <Actions isSaving={!!isSaving} onLogTrip={handleLogTrip} />
    </Box>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
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
  );
}

const TripSummary = memo(function TripSummary({
  miles,
  hours,
  minutes,
}: {
  miles: number;
  hours: number;
  minutes: number;
}) {
  return (
    <Stack spacing={0.25} sx={{ mb: 1.5 }}>
      <Typography variant="h6" fontWeight={800}>
        Trip Summary
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {miles.toLocaleString()} miles • ~ {hours}h {minutes}m
      </Typography>
    </Stack>
  );
});

function ErrorAlert({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <Alert
      severity="error"
      icon={<WarningAmberIcon />}
      sx={{ borderRadius: 2, mt: 1.5 }}
    >
      {error}
    </Alert>
  );
}

function Actions({
  isSaving,
  onLogTrip,
}: {
  isSaving: boolean;
  onLogTrip: () => void;
}) {
  return (
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
  );
}
