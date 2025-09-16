import { apiFetch } from "./api";

export type Driver = {
    id: string;
    first_name: string;
    carrier_name?: string;
    license_number: string;
};

export type TripStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export type Trip = {
    id: string;
    driver_id: string;
    pickup_location: string;
    dropoff_location: string;
    status: TripStatus;
    trip_distance?: number;
    estimated_duration?: number;
    current_cycle_hours: number;
    created_at: string;
    updated_at: string;
};

export type Violation = {
    type: 'driving_time' | 'on_duty' | 'break' | 'cycle' | string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
};

export type DailyLog = {
    id: string;
    driver_id: string;
    log_date: string;
    total_driving_time: number;
    total_on_duty_time: number;
    total_off_duty_time: number;
    cycle_hours_used: number;
    is_compliant: boolean;
    violations: Violation[];
    created_at: string;
    updated_at: string;
};

export type RouteStopType = 'pickup' | 'dropoff' | 'fuel' | 'break' | 'rest';

export type LatLng = { lat: number; lng: number, name?: string };

export type RouteStop = {
    id: string;
    type: RouteStopType;
    coord: LatLng;
    etaIso: string;
    durationMin: number;
    note?: string;
};

export type RouteData = {
    polyline: LatLng[];
    total_distance: number;
    total_duration: number;
    stops: RouteStop[];
};


export type TripCalcRequest = {
    currentLocation: LatLng;
    pickupLocation: LatLng;
    dropoffLocation: LatLng;
    currentCycleUsedHours: number;
    startTimeIso: string;
};

export type StopType = "pickup" | "break" | "fuel" | "rest" | "dropoff";

export type TripStop = {
    id: string;
    type: StopType;
    coord: LatLng;
    etaIso: string;
    durationMin: number;
    poi?: { name?: string | null; tags?: Record<string, string> };
    note?: string;
};

export type SegmentStatus = "DRIVING" | "ONDUTY" | "OFF" | "SB";

export type Segment = {
    startIso: string;
    endIso: string;
    status: SegmentStatus;
    label?: string;
};

export type DayBucket = {
    date: string;
    segments: Segment[];
};

type LocationType = { name: string, lng: number, lat: number }

export type TripCalcResponse = {
    draft_id: string
    route: {
        geometry: { type: "LineString"; coordinates: [number, number][] };
        distance_m: number;
        duration_s: number;
        bbox?: number[];
    };
    stops: TripStop[];
    stats: Record<string, number>;
    places: { current: LocationType, dropoff: LocationType, pickup: LocationType },
    dayBuckets?: DayBucket[];
}



export async function calculateTrip(payload: unknown) {
    const res = await apiFetch("/api/trips/calculate", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to calculate");
    return res.json();
}
