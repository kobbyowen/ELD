import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

type LaneKey = "off" | "sb" | "driving" | "onduty";

export type DutyChange = { tMin: number; lane: LaneKey };

type Totals = {
  off: string | number;
  sb: string | number;
  driving: string | number;
  onduty: string | number;
};

type Props = {
  changes: DutyChange[];
  totals: Totals;
  height?: number;
  showHourBand?: boolean;
};

const LANE_LABELS: Record<LaneKey, string> = {
  off: "1. Off Duty",
  sb: "2. Sleeper Berth",
  driving: "3. Driving",
  onduty: "4. On Duty (not driving)",
};

export default function DailyLogGrid({
  changes,
  totals,
  height = 220,
  showHourBand = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRefs = useRef<Record<LaneKey, HTMLDivElement | null>>({
    off: null,
    sb: null,
    driving: null,
    onduty: null,
  });

  const [svgDims, setSvgDims] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const [pathD, setPathD] = useState("");

  const laneOrder = useMemo<ReadonlyArray<LaneKey>>(
    () => ["off", "sb", "driving", "onduty"],
    []
  );
  const lastDimsRef = useRef<{
    w: number;
    h: number;
    left: number;
    top: number;
  } | null>(null);
  const lastPathRef = useRef<string>("");

  const buildPath = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const tracks = laneOrder
      .map((k) => trackRefs.current[k])
      .filter(Boolean) as HTMLDivElement[];
    if (!tracks.length) return;

    const first = tracks[0].getBoundingClientRect();
    const last = tracks[tracks.length - 1].getBoundingClientRect();
    const parent = wrap.getBoundingClientRect();

    const left = first.left - parent.left;
    const right = first.right - parent.left;
    const top = first.top - parent.top;
    const bottom = last.bottom - parent.top;
    const w = right - left;
    const h = bottom - top;

    // setDims only if changed
    const nextDims = { w, h, left, top };
    const prevDims = lastDimsRef.current;
    if (
      !prevDims ||
      prevDims.w !== w ||
      prevDims.h !== h ||
      prevDims.left !== left ||
      prevDims.top !== top
    ) {
      lastDimsRef.current = nextDims;
      setSvgDims(nextDims);
    }

    const cy: Record<LaneKey, number> = {} as any;
    laneOrder.forEach((k) => {
      const el = trackRefs.current[k];
      if (!el) return;
      const r = el.getBoundingClientRect();
      cy[k] = r.top - parent.top - top + r.height / 2;
    });

    const xOf = (min: number) => Math.max(0, Math.min(w, (min / 1440) * w));
    if (!changes?.length) {
      if (lastPathRef.current !== "") {
        lastPathRef.current = "";
        setPathD("");
      }
      return;
    }

    let d = `M ${xOf(changes[0].tMin)} ${cy[changes[0].lane]}`;
    for (let i = 1; i < changes.length; i++) {
      const c = changes[i];
      d += ` H ${xOf(c.tMin)} V ${cy[c.lane]}`;
    }

    if (lastPathRef.current !== d) {
      lastPathRef.current = d;
      setPathD(d);
    }
  }, [changes, laneOrder]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => buildPath());
    ro.observe(wrapRef.current);
    requestAnimationFrame(buildPath);
    return () => ro.disconnect();
  }, [buildPath]);

  const hourMarks = useMemo(
    () =>
      Array.from({ length: 25 }).map((_, h) => ({
        key: h,
        label: h === 0 ? "Mid." : h === 12 ? "Noon" : String(h % 12 || 12),
        leftPct: (h / 24) * 100,
      })),
    []
  );

  return (
    <Box
      ref={wrapRef}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        position: "relative",
        bgcolor: "background.paper",
      }}
      style={{ height }}
    >
      {showHourBand && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "70px 1fr 60px",
            borderBottom: "1px solid",
            borderColor: "divider",
            alignItems: "end",
            bgcolor: "grey.900",
            color: "common.white",
          }}
          style={{ height: 32 }}
        >
          <Box sx={{ px: 1, fontSize: 12, alignSelf: "center" }}>Mid.</Box>
          <Box
            sx={{
              position: "relative",
              height: 32,
              borderLeft: "1px solid",
              borderRight: "1px solid",
              borderColor: "divider",
            }}
          >
            {hourMarks.map((m) =>
              m.key < 24 ? (
                <Typography
                  key={m.key}
                  sx={{
                    position: "absolute",
                    top: 4,
                    left: `${m.leftPct}%`,
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    px: 0.25,
                    bgcolor: "grey.900",
                  }}
                >
                  {m.label}
                </Typography>
              ) : null
            )}
          </Box>
          <Box sx={{ fontSize: 12, textAlign: "center" }}>Total Hours</Box>
        </Box>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateRows: "repeat(4,1fr)",
          height: `calc(100% - ${showHourBand ? 32 : 0}px)`,
        }}
      >
        {laneOrder.map((laneKey, idx) => {
          const topTicks = laneKey === "off" || laneKey === "sb";
          const total =
            laneKey === "off"
              ? totals.off
              : laneKey === "sb"
              ? totals.sb
              : laneKey === "driving"
              ? totals.driving
              : totals.onduty;
          return (
            <Box
              key={laneKey}
              sx={{
                display: "grid",
                gridTemplateColumns: "70px 1fr 60px",
                borderBottom: idx === 3 ? 0 : "1px solid",
                borderColor: "divider",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  px: 1,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                {LANE_LABELS[laneKey]}
              </Box>

              <Box
                ref={(el) => {
                  trackRefs.current[laneKey] = el as HTMLDivElement | null;
                }}
                sx={{
                  position: "relative",
                  borderLeft: "1px solid",
                  borderRight: "1px solid",
                  borderColor: "divider",
                  overflow: "hidden",
                  "&::before, &::after": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: 12,
                    pointerEvents: "none",
                  },
                  // 15-min tick lines (strong)
                  "&::before": {
                    [topTicks ? "top" : "bottom"]: 0,
                    backgroundImage:
                      "repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px calc(100%/96))",
                    backgroundRepeat: "repeat-x",
                    backgroundSize: "calc(100%/96) 100%",
                    opacity: 0.9,
                  },

                  "&::after": {
                    [topTicks ? "top" : "bottom"]: 0,
                    backgroundImage:
                      "repeating-linear-gradient(90deg,#000 0 1px,transparent 1px calc(100%/24))",
                    backgroundRepeat: "repeat-x",
                    backgroundSize: "calc(100%/24) 100%",
                    opacity: 0.25,
                  },
                }}
              />

              <Box
                sx={{
                  px: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                }}
              >
                {total}
              </Box>
            </Box>
          );
        })}
      </Box>

      {pathD && (
        <svg
          width={svgDims.w}
          height={svgDims.h}
          viewBox={`0 0 ${svgDims.w} ${svgDims.h}`}
          style={{
            position: "absolute",
            left: svgDims.left,
            top: (showHourBand ? 32 : 0) + svgDims.top,
            pointerEvents: "none",
          }}
        >
          <path
            d={pathD}
            stroke="#000"
            strokeWidth={2.25}
            fill="none"
            shapeRendering="crispEdges"
            strokeLinecap="square"
          />
        </svg>
      )}
    </Box>
  );
}
