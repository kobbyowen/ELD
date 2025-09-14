from math import radians, sin, cos, asin, sqrt

# Heuristics / rules for a simple first pass
AVG_SPEED_KMPH = 88.5  # ~55 mph average
BREAK_AT_DRIVE_H = 7.5  # take 30-min break before hitting 8h driving
BREAK_MIN = 30
FUEL_EVERY_KM = 1609.344  # ~1000 miles
FUEL_MIN = 20
DRIVE_LIMIT_H = 11  # 11 hours driving per day
REST_MIN = 10 * 60  # 10h off-duty
CYCLE_LIMIT_H = 70  # 70-hour / 8 days
RESTART_MIN = 34 * 60  # 34h restart if cycle would exceed


def _haversine_km(p1, p2):
    lat1, lon1 = p1[1], p1[0]
    lat2, lon2 = p2[1], p2[0]
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


def _total_km(geometry):
    coords = geometry.get("coordinates") or []
    if len(coords) < 2:
        return 0.0
    dist = 0.0
    for i in range(1, len(coords)):
        dist += _haversine_km(coords[i - 1], coords[i])
    return dist


def plan_stops(route_geom, start_dt, current_cycle_h):
    """
    Returns a list of stop dicts with:
    { "type": "break"|"fuel"|"rest",
      "at_km": float,            # along the route from origin
      "durationMin": int,
      "note": str }
    """
    stops = []

    total_km = _total_km(route_geom)
    if total_km <= 0:
        return stops

    total_drive_h = total_km / AVG_SPEED_KMPH

    # Optional: plan a 34h restart near the start if cycle is already very high
    # (simple heuristic — refine later with exact duty simulation)
    if current_cycle_h >= 60:
        stops.append(
            {"type": "rest", "at_km": 0.0, "durationMin": RESTART_MIN, "note": "34-hour restart (cycle near limit)"}
        )
        # After restart, cycle resets effectively for planning purposes

    # 30-min break before hitting 8h driving (place at ~7.5h of driving if needed)
    if total_drive_h > BREAK_AT_DRIVE_H:
        break_km = BREAK_AT_DRIVE_H * AVG_SPEED_KMPH
        break_km = min(break_km, max(0.0, total_km - 1e-3))
        stops.append(
            {
                "type": "break",
                "at_km": break_km,
                "durationMin": BREAK_MIN,
                "note": "30-min break (before 8h driving rule)",
            }
        )

    # Fuel every ~1000 miles (1609km)
    km = FUEL_EVERY_KM
    while km < total_km:
        stops.append({"type": "fuel", "at_km": km, "durationMin": FUEL_MIN, "note": "Fuel stop (~1000 mi interval)"})
        km += FUEL_EVERY_KM

    # Daily 10h rest if more than 11h of driving needed
    if total_drive_h > DRIVE_LIMIT_H:
        rest_km = DRIVE_LIMIT_H * AVG_SPEED_KMPH
        rest_km = min(rest_km, max(0.0, total_km - 1e-3))
        stops.append(
            {"type": "rest", "at_km": rest_km, "durationMin": REST_MIN, "note": "10h off-duty (11h driving/day limit)"}
        )

    # Sort by distance along route
    stops.sort(key=lambda s: s["at_km"])
    return stops
