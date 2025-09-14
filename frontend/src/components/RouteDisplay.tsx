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

export function RouteDisplay({ data }: { data: TripCalcResponse }) {
  const distMi = Math.round((data.route.distance_m / 1609.344) * 10) / 10;
  const hrs = Math.floor(data.route.duration_s / 3600);
  const mins = Math.round((data.route.duration_s % 3600) / 60);

  return (
    <Card elevation={1} sx={{ borderRadius: 2 }}>
      <CardHeader
        title={
          <Stack direction="row" spacing={1} alignItems="center">
            <LocalShippingIcon color="primary" />
            <Typography variant="h6">Route & Planned Stops</Typography>
          </Stack>
        }
      />
      <CardContent>
        <Stack direction="row" spacing={3} mb={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <RoomIcon color="action" />
            <Typography variant="body2">
              {distMi.toLocaleString()} mi
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <AccessTimeIcon color="action" />
            <Typography variant="body2">
              ~{hrs}h {mins}m
            </Typography>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Stack spacing={1.25}>
          {data.stops.map((s) => (
            <Stack
              key={s.id}
              direction="row"
              spacing={1.25}
              alignItems="center"
              flexWrap="wrap"
            >
              <Chip size="small" label={s.type.toUpperCase()} />
              <Typography variant="body2">
                {new Date(s.etaIso).toLocaleString()} • {s.durationMin}m
                {s.poi?.name ? ` • ${s.poi.name}` : ""}
                {s.note ? ` • ${s.note}` : ""}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
