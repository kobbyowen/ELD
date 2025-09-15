import { apiFetch } from "./api";
import type { TripCalcRequest, TripCalcResponse } from "./types";

export async function calculateTrip(payload: TripCalcRequest): Promise<TripCalcResponse> {
    const res = await apiFetch("/api/trip/calculate", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        let msg = "Failed to calculate trip";
        try {
            const j = await res.json();
            msg = j?.detail || j?.error || JSON.stringify(j);
        } catch { /* empty */ }
        throw new Error(msg);
    }
    return res.json();
}


export async function logTrip(payload: {
    draft_id: string;
    equipment_text?: string;
    carrier_name?: string;
    main_office_address?: string;
    home_terminal_address?: string;
    remarks?: string;
    bl_or_manifest?: string;
    shipper_commodity?: string;
    additional_notes?: string;
    recap_70_a_last7_incl_today?: string;
    recap_70_b_available_tomorrow?: string;
}) {
    const res = await apiFetch("/api/trips", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to log trip");
    }
    return res.json();
}

export async function listTrips() {
    const res = await apiFetch("/api/trips");
    if (!res.ok) throw new Error("Failed to load trips");
    return res.json();
}

export async function deleteTrip(id: string) {
    const res = await apiFetch(`/api/trips/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete");
}

type LaneKey = "off" | "sb" | "driving" | "onduty";
type DutyChange = { tMin: number; lane: LaneKey };

type Stop = {
    id: string;
    type: "pickup" | "break" | "fuel" | "rest" | "dropoff";
    etaIso: string;       // ISO string with Z or offset
    durationMin: number;  // minutes
};

type CalcPayload = {
    stops: Stop[];
    route?: { duration_s?: number };
};

const STOP_TO_LANE: Record<Stop["type"], LaneKey> = {
    pickup: "onduty",
    dropoff: "onduty",
    fuel: "onduty",
    break: "off",
    rest: "sb",
};

const clampDay = (m: number) => Math.max(0, Math.min(1440, m));

function utcMidnight(d: Date): Date {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
}

function minsFromUtcMidnight(iso: string, dayAnchorUTC: Date): number {
    const t = new Date(iso).getTime();
    const base = dayAnchorUTC.getTime();
    return clampDay(Math.round((t - base) / 60000));
}

export function timelineFromCalc(calc: CalcPayload): {
    changes: DutyChange[];
    totals: { off: string; sb: string; driving: string; onduty: string };
} {
    const stops = [...(calc.stops ?? [])].sort(
        (a, b) => new Date(a.etaIso).getTime() - new Date(b.etaIso).getTime()
    );

    // Anchor at UTC midnight for the day of the first stop (fallback: today UTC)
    const dayUTC = stops.length ? utcMidnight(new Date(stops[0].etaIso)) : utcMidnight(new Date());

    // Build raw changes: start OFF at 0
    const raw: DutyChange[] = [{ tMin: 0, lane: "off" }];

    for (const s of stops) {
        const start = minsFromUtcMidnight(s.etaIso, dayUTC);
        const end = clampDay(start + (s.durationMin || 0));

        // Enter stop lane at start
        raw.push({ tMin: start, lane: STOP_TO_LANE[s.type] });

        // After stop ends, drive until the next event (unless end==1440)
        if (end > start && end < 1440) {
            raw.push({ tMin: end, lane: "driving" });
        }
    }

    // After the last event, go OFF until end of day
    raw.push({ tMin: 1440, lane: "off" });

    // Normalize: sort and collapse duplicates
    raw.sort((a, b) => a.tMin - b.tMin || (a.lane > b.lane ? 1 : -1));
    const changes: DutyChange[] = [];
    for (const c of raw) {
        const t = clampDay(c.tMin);
        if (!changes.length) {
            changes.push({ tMin: t, lane: c.lane });
            continue;
        }
        const last = changes[changes.length - 1];
        if (t === last.tMin) {
            // same instant: last writer wins (later entry overrides earlier)
            last.lane = c.lane;
        } else if (c.lane !== last.lane) {
            changes.push({ tMin: t, lane: c.lane });
        }
    }
    if (changes[changes.length - 1].tMin !== 1440) {
        changes.push({ tMin: 1440, lane: "off" });
    }

    // Totals (in minutes → hours string, 1 decimal)
    const mins = { off: 0, sb: 0, driving: 0, onduty: 0 };
    for (let i = 0; i < changes.length - 1; i++) {
        const span = Math.max(0, changes[i + 1].tMin - changes[i].tMin);
        mins[changes[i].lane] += span;
    }
    const toHr = (m: number) => (Math.round((m / 60) * 10) / 10).toFixed(1);

    return {
        changes,
        totals: {
            off: toHr(mins.off),
            sb: toHr(mins.sb),
            driving: toHr(mins.driving),
            onduty: toHr(mins.onduty),
        },
    };
}
