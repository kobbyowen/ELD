import type { RouteData } from './types';

function isoAfter(minutesFromNow: number): string {
    const d = new Date(Date.now() + minutesFromNow * 60_000);
    return d.toISOString();
}

export const RoutePlanningService = {
    async calculateRoute(
        pickupLocation: string,
        dropoffLocation: string,

    ): Promise<RouteData> {
        // naive numbers just so the UI works
        const distance = Math.max(120, Math.round(Math.random() * 500) + 200); // 200–700 mi
        const durationMin = Math.round(distance / 55 * 60); // assume ~55mph avg

        return {
            polyline: [
                { lat: 34.0522, lng: -118.2437 }, // LA-ish
                { lat: 36.1627, lng: -86.7816 },  // mid waypoint
                { lat: 40.7128, lng: -74.0060 },  // NYC-ish
            ],
            total_distance: distance,
            total_duration: durationMin,
            stops: [
                {
                    id: crypto.randomUUID(),
                    type: 'pickup',
                    coord: { lat: 34.05, lng: -118.24 },
                    etaIso: isoAfter(0),
                    durationMin: 60,
                    note: `Pickup at ${pickupLocation}`,
                },
                {
                    id: crypto.randomUUID(),
                    type: 'break',
                    coord: { lat: 36.16, lng: -86.78 },
                    etaIso: isoAfter(4 * 60),
                    durationMin: 30,
                    note: '30-min break',
                },
                {
                    id: crypto.randomUUID(),
                    type: 'dropoff',
                    coord: { lat: 40.71, lng: -74.0 },
                    etaIso: isoAfter(10 * 60),
                    durationMin: 60,
                    note: `Drop-off at ${dropoffLocation}`,
                },
            ],
        };
    },
};
