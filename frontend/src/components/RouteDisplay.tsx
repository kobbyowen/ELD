// src/components/RouteDisplay.tsx
import { useMemo, memo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Stack,
  Chip,
  Divider,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import RoomIcon from "@mui/icons-material/Room";
import type { TripCalcResponse } from "../lib/types";

type Props = { data: TripCalcResponse };

export function RouteDisplay({ data }: Props) {
  const { distMi, hours, mins } = useMemo(() => {
    const miles = data.route.distance_m / 1609.344;
    const s = data.route.duration_s;
    return {
      distMi: Math.round(miles * 10) / 10,
      hours: Math.floor(s / 3600),
      mins: Math.round((s % 3600) / 60),
    };
  }, [data]);

  const renderHeaderTitle = useMemo(
    () => (
      <Stack direction="row" spacing={1} alignItems="center">
        <LocalShippingIcon color="primary" />
        <Typography variant="h6">Route &amp; Planned Stops</Typography>
      </Stack>
    ),
    []
  );

  return (
    <Card elevation={1} sx={{ borderRadius: 2 }}>
      <CardHeader title={renderHeaderTitle} />
      <CardContent>
        <RouteStats distMi={distMi} hours={hours} mins={mins} />
        <Divider sx={{ my: 1.5 }} />
        <StopsList stops={data.stops} />
      </CardContent>
    </Card>
  );
}

function RouteStats({
  distMi,
  hours,
  mins,
}: {
  distMi: number;
  hours: number;
  mins: number;
}) {
  return (
    <Stack direction="row" spacing={3} mb={1}>
      <Stat
        icon={<RoomIcon color="action" />}
        text={`${distMi.toLocaleString()} mi`}
      />
      <Stat
        icon={<AccessTimeIcon color="action" />}
        text={`~${hours}h ${mins}m`}
      />
    </Stack>
  );
}

function Stat({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {icon}
      <Typography variant="body2">{text}</Typography>
    </Stack>
  );
}

type Stop = TripCalcResponse["stops"][number];

function StopsList({ stops }: { stops: Stop[] }) {
  return (
    <Stack spacing={1.25}>
      {stops.map((s) => (
        <StopRow key={s.id} stop={s} />
      ))}
    </Stack>
  );
}

const StopRow = memo(function StopRow({ stop }: { stop: Stop }) {
  const chipColor = getChipColor(stop.type);
  const line = buildStopLine(stop);
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
      <Chip
        size="small"
        label={stop.type.toUpperCase()}
        color={chipColor}
        variant="outlined"
      />
      <Typography variant="body2">{line}</Typography>
    </Stack>
  );
});

function getChipColor(
  t: Stop["type"]
):
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info" {
  switch (t) {
    case "pickup":
      return "success";
    case "dropoff":
      return "warning";
    case "fuel":
      return "info";
    case "rest":
      return "error";
    case "break":
      return "primary";
    default:
      return "default";
  }
}

function buildStopLine(s: Stop): string {
  const parts: string[] = [];
  const when = new Date(s.etaIso).toLocaleString();
  parts.push(when);
  parts.push(`${s.durationMin}m`);
  if (s.poi?.name) parts.push(s.poi.name);
  if (s.note) parts.push(s.note);
  return parts.join(" • ");
}
