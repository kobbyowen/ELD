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
