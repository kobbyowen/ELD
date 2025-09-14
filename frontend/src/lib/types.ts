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
    trip_distance?: number;       // miles
    estimated_duration?: number;  // minutes
    current_cycle_hours: number;  // hours used in 8-day cycle
    created_at: string;           // ISO
    updated_at: string;           // ISO
};

export type Violation = {
    type: 'driving_time' | 'on_duty' | 'break' | 'cycle' | string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string; // ISO
};

export type DailyLog = {
    id: string;
    driver_id: string;
    log_date: string;           // ISO date
    total_driving_time: number; // minutes
    total_on_duty_time: number; // minutes
    total_off_duty_time: number;// minutes
    cycle_hours_used: number;   // hours
    is_compliant: boolean;
    violations: Violation[];
    created_at: string;
    updated_at: string;
};

export type RouteStopType = 'pickup' | 'dropoff' | 'fuel' | 'break' | 'rest';

export type LatLng = { lat: number; lng: number };

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
    total_distance: number;   // miles
    total_duration: number;   // minutes
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

export type TripCalcResponse = {
    route: {
        geometry: { type: "LineString"; coordinates: [number, number][] };
        distance_m: number;
        duration_s: number;
        bbox?: number[];
    };
    stops: TripStop[];
    stats: Record<string, number>;
};
