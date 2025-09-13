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
