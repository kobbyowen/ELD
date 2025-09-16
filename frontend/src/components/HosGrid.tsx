import * as React from "react";
import { Box, Typography } from "@mui/material";

type Segment = {
  startIso: string;
  endIso: string;
  status: "DRIVING" | "ONDUTY" | "OFF" | "SB";
  label?: string;
};
type DayBucket = { date: string; segments: Segment[] };

type HosLogGridProps = {
  day?: DayBucket;
  width?: number;
  height?: number;
  title?: string;
  showTitle?: boolean;
  strokeColor?: string;
  tickColor?: string;
  trackStroke?: string;
  isFirstDay?: boolean;
};

function parseIsoUTC(iso: string): Date {
  const s = iso.endsWith("Z") ? iso : iso.replace("+00:00", "Z");
  return new Date(s);
}

const HOURS = 24;
const LANE_ORDER: Array<Segment["status"]> = ["OFF", "SB", "DRIVING", "ONDUTY"];

function statusToLaneY(
  status: Segment["status"],
  graphTop: number,
  graphBottom: number
) {
  const lane = LANE_ORDER.indexOf(status);
  const lanes = LANE_ORDER.length;
  const laneHeight = (graphBottom - graphTop) / lanes;
  const yTop = graphTop + laneHeight * lane;
  const yBottom = yTop + laneHeight;
  const yCenter = (yTop + yBottom) / 2;
  return { laneTop: yTop, laneBottom: yBottom, yCenter, laneHeight };
}

function fmtHHMM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

const HosLogGrid: React.FC<HosLogGridProps> = ({
  day,
  width = 1200,
  height = 520,
  title = "The Graph Grid",
  showTitle = true,
  strokeColor = "#000",
  tickColor = "#000",
  trackStroke = "#1f6feb",
  isFirstDay = false,
}) => {
  const totalsGutter = 140;
  const marginLeft = 140;
  const marginRight = 20;
  const marginTop = showTitle ? 60 : 20;
  const marginBottom = 180;

  const graphLeft = marginLeft;
  const graphRight = width - marginRight - totalsGutter;
  const graphWidth = Math.max(200, graphRight - graphLeft);

  const lanesTop = marginTop + 10;
  const lanesBottom = height - marginBottom;
  const lanesHeight = lanesBottom - lanesTop;

  const remarksTop = lanesBottom + 1;
  const remarksBottom = height - 20;
  const remarksHeight = remarksBottom - remarksTop;

  const majorTickLen = 18;
  const minorTickLen = 10;
  const quarterTickEveryMin = 15;
  const tickStrokeWidth = 1;

  const CONNECT_TOL_MS = 60 * 1000;

  const hourLabels: Record<number, string> = { 0: "Midnight", 12: "Noon" };

  const laneLines = [];
  for (let i = 0; i <= LANE_ORDER.length; i++) {
    const y = lanesTop + (lanesHeight / LANE_ORDER.length) * i;
    laneLines.push({ y });
  }
  const hourXs: number[] = [];
  for (let h = 0; h <= HOURS; h++) {
    hourXs.push(graphLeft + (graphWidth / HOURS) * h);
  }

  // Day window from bucket.date
  let dayStartMs = 0;
  let dayEndMs = 0;
  if (day?.date) {
    const [y, m, d] = day.date.split("-").map(Number);
    const start = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
    dayStartMs = start.getTime();
    dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  }

  const mapMsToX = (ms: number) => {
    // Clamp mapping strictly to [dayStart, dayEnd]
    const clamped = Math.max(dayStartMs, Math.min(dayEndMs, ms));
    const frac = (clamped - dayStartMs) / (dayEndMs - dayStartMs || 1);
    return graphLeft + frac * graphWidth;
  };

  // Totals: count only the portion that overlaps this day
  const totalsMin: Record<Segment["status"], number> = {
    OFF: 0,
    SB: 0,
    DRIVING: 0,
    ONDUTY: 0,
  };
  if (day?.segments?.length && dayStartMs && dayEndMs) {
    for (const seg of day.segments) {
      const s = parseIsoUTC(seg.startIso).getTime();
      const e = parseIsoUTC(seg.endIso).getTime();
      const startMs = Math.max(dayStartMs, Math.min(dayEndMs, s));
      const endMs = Math.max(dayStartMs, Math.min(dayEndMs, e));
      const mins = Math.max(0, Math.round((endMs - startMs) / 60000));
      totalsMin[seg.status] += mins;
    }
  }

  const horizontals: Array<React.JSX.Element> = [];
  const connectors: Array<React.JSX.Element> = [];

  if (day?.segments?.length && dayStartMs && dayEndMs) {
    const [first, _, ...segs] = [...day.segments].sort((a, b) =>
      a.startIso.localeCompare(b.startIso)
    );

    const display = (isFirstDay ? [first, ...segs] : [first, _, ...segs])
      .map((seg, i) => {
        const sMs = parseIsoUTC(seg.startIso).getTime();
        const eMs = parseIsoUTC(seg.endIso).getTime();
        const startMs = Math.max(dayStartMs, Math.min(dayEndMs, sMs));
        const endMs = Math.max(dayStartMs, Math.min(dayEndMs, eMs));
        if (endMs <= startMs) return null; // no overlap with the day
        const x1 = mapMsToX(startMs);
        const x2 = mapMsToX(endMs);
        const { yCenter } = statusToLaneY(seg.status, lanesTop, lanesBottom);
        return { i, seg, sMs, eMs, startMs, endMs, x1, x2, y: yCenter };
      })
      .filter(Boolean) as Array<{
      i: number;
      seg: Segment;
      sMs: number;
      eMs: number;
      startMs: number;
      endMs: number;
      x1: number;
      x2: number;
      y: number;
    }>;

    // Connect consecutive segments when the clamped end ~= next clamped start
    for (let i = 0; i < display.length - 1; i++) {
      const a = display[i];
      const b = display[i + 1];
      const gapMs = Math.abs(b.startMs - a.endMs);
      if (gapMs <= CONNECT_TOL_MS && a.y !== b.y) {
        const xJoin = b.x1; // join at next segment's exact start
        connectors.push(
          <line
            key={`vlink-${i}`}
            x1={xJoin}
            x2={xJoin}
            y1={a.y}
            y2={b.y}
            stroke={trackStroke}
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      }
    }

    // Draw horizontals last so their rounded caps cover connector endpoints
    for (const d of display) {
      horizontals.push(
        <line
          key={`seg-${d.i}`}
          x1={d.x1}
          x2={d.x2}
          y1={d.y}
          y2={d.y}
          stroke={trackStroke}
          strokeWidth={6}
          strokeLinecap="round"
        />
      );
    }
  }

  return (
    <Box sx={{ width, overflow: "auto", zoom: 0.5, margin: "20px auto" }}>
      {showTitle && (
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, color: "#0a66c2", mb: 1 }}
        >
          {title}
        </Typography>
      )}

      <svg width={width} height={height} role="img" aria-label="HOS Graph Grid">
        <g
          fontFamily="Inter, system-ui, Arial, sans-serif"
          fontSize="16"
          fill="#000"
        >
          <text
            x={marginLeft - 20}
            y={lanesTop + lanesHeight / 8}
            textAnchor="end"
            dominantBaseline="middle"
          >
            Off{"\n"}Duty
          </text>
          <text
            x={marginLeft - 20}
            y={lanesTop + (3 * lanesHeight) / 8}
            textAnchor="end"
            dominantBaseline="middle"
          >
            Sleeper{"\n"}Berth
          </text>
          <text
            x={marginLeft - 20}
            y={lanesTop + (5 * lanesHeight) / 8}
            textAnchor="end"
            dominantBaseline="middle"
          >
            Driving
          </text>
          <text
            x={marginLeft - 20}
            y={lanesTop + (7 * lanesHeight) / 8}
            textAnchor="end"
            dominantBaseline="middle"
          >
            On Duty{"\n"}(Not Driving)
          </text>
          <text
            x={marginLeft - 20}
            y={remarksTop + remarksHeight / 2}
            textAnchor="end"
            dominantBaseline="middle"
          >
            REMARKS
          </text>
        </g>

        <rect
          x={graphLeft}
          y={lanesTop}
          width={graphWidth}
          height={lanesHeight}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
        />
        <rect
          x={graphLeft}
          y={remarksTop}
          width={graphWidth}
          height={remarksHeight}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
        />

        {laneLines.map((l, idx) =>
          idx > 0 && idx < LANE_ORDER.length ? (
            <line
              key={`lane-${idx}`}
              x1={graphLeft}
              x2={graphRight}
              y1={l.y}
              y2={l.y}
              stroke={strokeColor}
              strokeWidth={2}
            />
          ) : null
        )}

        {hourXs.map((x, h) => (
          <g key={`hcol-${h}`}>
            <line
              x1={x}
              x2={x}
              y1={lanesTop}
              y2={lanesBottom}
              stroke={strokeColor}
              strokeWidth={1.5}
            />
            <line
              x1={x}
              x2={x}
              y1={lanesTop}
              y2={lanesTop + majorTickLen}
              stroke={tickColor}
              strokeWidth={tickStrokeWidth}
            />
            {[0, 1, 2, 3].map((i) => {
              const y = lanesTop + (lanesHeight / LANE_ORDER.length) * (i + 1);
              return (
                <line
                  key={`tick-${h}-${i}`}
                  x1={x}
                  x2={x}
                  y1={y - majorTickLen}
                  y2={y}
                  stroke={tickColor}
                  strokeWidth={tickStrokeWidth}
                />
              );
            })}
            {h < HOURS &&
              Array.from({ length: 60 / quarterTickEveryMin - 1 }, (_, i) => {
                const frac = (i + 1) * (quarterTickEveryMin / 60);
                const xm = x + frac * (graphWidth / HOURS);
                return (
                  <g key={`minor-${h}-${i}`}>
                    <line
                      x1={xm}
                      x2={xm}
                      y1={lanesTop}
                      y2={lanesTop + minorTickLen}
                      stroke={tickColor}
                      strokeWidth={tickStrokeWidth}
                    />
                    {[0, 1, 2, 3].map((k) => {
                      const y =
                        lanesTop + (lanesHeight / LANE_ORDER.length) * (k + 1);
                      return (
                        <line
                          key={`minor-${h}-${i}-${k}`}
                          x1={xm}
                          x2={xm}
                          y1={y - minorTickLen}
                          y2={y}
                          stroke={tickColor}
                          strokeWidth={tickStrokeWidth}
                        />
                      );
                    })}
                  </g>
                );
              })}
            {h === 0 || h === 12 ? (
              <text
                x={x + 3}
                y={lanesTop - 18}
                fontFamily="Inter, system-ui, Arial, sans-serif"
                fontSize="14"
                fill="#000"
              >
                {hourLabels[h]}
              </text>
            ) : null}
            <text
              x={x + 3}
              y={lanesTop - 4}
              fontFamily="Inter, system-ui, Arial, sans-serif"
              fontSize="12"
              fill="#000"
            >
              {h === 12 ? "12" : h % 12}
            </text>
          </g>
        ))}

        {/* connectors behind */}
        {connectors}
        {/* horizontals on top */}
        {horizontals}

        {/* totals gutter */}
        <g
          transform={`translate(${graphRight + 12}, ${lanesTop})`}
          fontFamily="Inter, system-ui, Arial, sans-serif"
        >
          <text x={0} y={-12} fontSize="14" fontWeight={600}>
            Totals
          </text>
          {LANE_ORDER.map((status, idx) => {
            const label =
              status === "OFF"
                ? "Off Duty"
                : status === "SB"
                ? "Sleeper Berth"
                : status === "DRIVING"
                ? "Driving"
                : "On Duty";
            const y = (lanesHeight / LANE_ORDER.length) * idx + 18;
            return (
              <g key={status} transform={`translate(0, ${y})`}>
                <text x={0} y={0} fontSize="13">
                  {label}
                </text>
                <text x={0} y={18} fontSize="16" fontWeight={700}>
                  {fmtHHMM(totalsMin[status])}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {day?.date && (
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          {day.date}
        </Typography>
      )}
    </Box>
  );
};

export default HosLogGrid;
