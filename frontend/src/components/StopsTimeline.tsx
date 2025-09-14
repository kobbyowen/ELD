import { memo } from "react";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import { Box, Typography } from "@mui/material";

import FlagIcon from "@mui/icons-material/Flag";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import FreeBreakfastIcon from "@mui/icons-material/FreeBreakfast";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import HotelIcon from "@mui/icons-material/Hotel";
import type { JSX } from "react";

type Stop = {
  id: string;
  type: "pickup" | "break" | "fuel" | "rest" | "dropoff";
  etaIso: string;
  durationMin: number;
  poi?: { name?: string | null };
  note?: string;
};

const iconFor: Record<Stop["type"], JSX.Element> = {
  pickup: <LocalShippingIcon />,
  break: <FreeBreakfastIcon />,
  fuel: <LocalGasStationIcon />,
  rest: <HotelIcon />,
  dropoff: <FlagIcon />,
};

const colorFor: Record<
  Stop["type"],
  "primary" | "secondary" | "success" | "warning" | "error"
> = {
  pickup: "success",
  break: "primary",
  fuel: "secondary",
  rest: "error",
  dropoff: "warning",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fmtHM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export default function StopsTimeline({ stops }: { stops: Stop[] }) {
  return (
    <Timeline position="right" sx={{ m: 0, p: 0 }}>
      {stops.map((s, i) => (
        <StopItem
          key={s.id}
          stop={s}
          isFirst={i === 0}
          isLast={i === stops.length - 1}
        />
      ))}
    </Timeline>
  );
}

const StopItem = memo(function StopItem({
  stop,
  isFirst,
  isLast,
}: {
  stop: Stop;
  isFirst: boolean;
  isLast: boolean;
}) {
  const title = cap(stop.type);
  const mins = `${stop.durationMin}m`;
  const paren = `(${fmtHM(stop.durationMin)})`;
  const when = new Date(stop.etaIso).toLocaleString();

  return (
    <TimelineItem sx={{ "&::before": { flex: 0, p: 0 } }}>
      <TimelineSeparator>
        {!isFirst && <TimelineConnector />}
        <TimelineDot color={colorFor[stop.type]}>
          {iconFor[stop.type]}
        </TimelineDot>
        {!isLast && <TimelineConnector />}
      </TimelineSeparator>

      <TimelineContent sx={{ py: 1.25, pl: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {mins} • {title} {paren}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {when}
        </Typography>

        {stop.poi?.name && (
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {stop.poi.name}
            </Typography>
          </Box>
        )}
        {stop.note && (
          <Box sx={{ mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {stop.note}
            </Typography>
          </Box>
        )}
      </TimelineContent>
    </TimelineItem>
  );
});
