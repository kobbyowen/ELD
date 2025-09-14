# api/trips/views.py
from __future__ import annotations

import uuid
import math
from datetime import datetime, timedelta, timezone
from typing import List, Tuple

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .serializers import TripCalcRequestSer, TripCalcResponseSer
from .services.routing import osrm_route
from .services.overpass import find_pois


def _id() -> str:
    return uuid.uuid4().hex


# ---------- time & geo helpers ----------


def _parse_start(val) -> datetime:
    if isinstance(val, datetime):
        dt = val
    else:
        s = str(val).strip()
        if s.endswith("Z"):
            s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


EARTH_R = 6371000.0  # meters


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    φ1, λ1 = math.radians(lat1), math.radians(lng1)
    φ2, λ2 = math.radians(lat2), math.radians(lng2)
    dφ, dλ = φ2 - φ1, λ2 - λ1
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def _route_distances_m(coords_lnglat: List[List[float]]) -> Tuple[float, List[float]]:
    """Total distance and per-segment cumulative distances along LineString."""
    if not coords_lnglat or len(coords_lnglat) < 2:
        return 0.0, [0.0]
    cum = [0.0]
    total = 0.0
    for i in range(1, len(coords_lnglat)):
        lng1, lat1 = coords_lnglat[i - 1]
        lng2, lat2 = coords_lnglat[i]
        d = _haversine_m(lat1, lng1, lat2, lng2)
        total += d
        cum.append(total)
    return total, cum


def _interpolate_on_line(coords_lnglat: List[List[float]], cum: List[float], target_m: float) -> Tuple[float, float]:
    """Return (lat, lng) at target distance along polyline."""
    if not coords_lnglat:
        return (0.0, 0.0)
    total = cum[-1]
    if target_m <= 0 or total <= 0:
        return (coords_lnglat[0][1], coords_lnglat[0][0])
    if target_m >= total:
        last = coords_lnglat[-1]
        return (last[1], last[0])
    # find segment
    lo = 0
    hi = len(cum) - 1
    while lo < hi and cum[lo] < target_m:
        lo += 1
    i = max(1, lo)
    prev_d = cum[i - 1]
    seg_len = cum[i] - prev_d if cum[i] - prev_d > 0 else 1.0
    t = (target_m - prev_d) / seg_len
    lng1, lat1 = coords_lnglat[i - 1]
    lng2, lat2 = coords_lnglat[i]
    lat = lat1 + t * (lat2 - lat1)
    lng = lng1 + t * (lng2 - lng1)
    return (lat, lng)


# ---------- business rules thresholds ----------
FUEL_EVERY_MILES = 1000.0
BREAK_AFTER_H = 8.0
DAILY_DRIVE_CAP_H = 11.0


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def calculate_trip(request):
    ser = TripCalcRequestSer(data=request.data)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data

    # Inputs
    cur = (d["currentLocation"]["lng"], d["currentLocation"]["lat"])  # (lng, lat)
    pick = (d["pickupLocation"]["lng"], d["pickupLocation"]["lat"])
    drop = (d["dropoffLocation"]["lng"], d["dropoffLocation"]["lat"])
    start_dt = _parse_start(d["startTimeIso"])

    # Route via OSRM
    route = osrm_route([cur, pick, drop])  # expects [(lng,lat),...]
    coords = route["geometry"]["coordinates"]  # [[lng,lat], ...]
    total_dist_m = route["distance_m"]
    total_drive_s = route["duration_s"]

    # If geometry present, compute cumulative distances (for accurate placement of optional stops)
    total_line_m, cum = _route_distances_m(coords) if coords else (total_dist_m, [0.0])

    # Split total drive time into leg1 (cur→pick) and leg2 (pick→drop) by straight-line ratio
    d1 = _haversine_m(cur[1], cur[0], pick[1], pick[0])
    d2 = _haversine_m(pick[1], pick[0], drop[1], drop[0])
    denom = d1 + d2 if (d1 + d2) > 0 else 1.0
    leg1_s = total_drive_s * (d1 / denom)
    leg2_s = total_drive_s - leg1_s

    # Build stops with strictly increasing ETAs
    t = start_dt
    stops = []

    # Drive to pickup (only if cur != pick and OSRM counted it)
    if leg1_s > 1:
        t += timedelta(seconds=leg1_s)

    # Pickup (1h on-duty)
    stops.append(
        {
            "id": _id(),
            "type": "pickup",
            "coord": {"lat": pick[1], "lng": pick[0]},
            "etaIso": t.isoformat(),
            "durationMin": 60,
            "note": "Pickup (1h)",
        }
    )
    t += timedelta(hours=1)

    # Optional stops based on **actual thresholds**
    # 1) Break after 8h of **continuous driving** – only if leg2 pushes us past 8h from today's start.
    # For a small trip (~30m), this never triggers.
    if (leg1_s + leg2_s) / 3600.0 >= BREAK_AFTER_H:
        # place at 8h from driving start (before pickup duty hour)
        break_drive_s_from_start = BREAK_AFTER_H * 3600.0
        # convert to distance fraction along full route (driving time ∝ distance in OSRM)
        frac = break_drive_s_from_start / total_drive_s if total_drive_s > 0 else 0.0
        target_m = total_line_m * frac
        lat_b, lng_b = _interpolate_on_line(coords, cum, target_m)
        stops.append(
            {
                "id": _id(),
                "type": "break",
                "coord": {"lat": lat_b, "lng": lng_b},
                "etaIso": (start_dt + timedelta(seconds=break_drive_s_from_start)).isoformat(),
                "durationMin": 30,
                "note": "30m break (8h rule)",
            }
        )
        # Do NOT advance `t` here; the break occurs earlier on the timeline — we’re already past it chronologically.
        # (If you want a strictly “playhead” flow, simulate minute-by-minute; for now we place accurate timestamps.)

    # 2) Fuel only if total distance ≥ 1000 miles
    total_miles = total_dist_m / 1609.344
    if total_miles >= FUEL_EVERY_MILES:
        # place fuel at 1,000 miles along the route (or middle if you prefer)
        fuel_target_m = min(total_line_m, 1609.344 * FUEL_EVERY_MILES)
        frac = fuel_target_m / total_line_m if total_line_m > 0 else 0.0
        fuel_drive_s = total_drive_s * frac
        lat_f, lng_f = _interpolate_on_line(coords, cum, fuel_target_m)

        # Try to snap to a nearby fuel POI (optional)
        pois = find_pois(lat_f, lng_f, "fuel", radius_m=15000)
        coord = pois[0]["coord"] if pois else {"lat": lat_f, "lng": lng_f}

        stops.append(
            {
                "id": _id(),
                "type": "fuel",
                "coord": coord,
                "etaIso": (start_dt + timedelta(seconds=fuel_drive_s)).isoformat(),
                "durationMin": 20,
                "poi": (
                    {"name": pois[0].get("name"), "tags": pois[0].get("tags")} if pois else {"name": None, "tags": {}}
                ),
                "note": "Fuel (20m)",
            }
        )

    # 3) Rest only if driving time ≥ 11h (daily driving cap). Place at 11h mark.
    if (leg1_s + leg2_s) / 3600.0 >= DAILY_DRIVE_CAP_H:
        rest_drive_s = DAILY_DRIVE_CAP_H * 3600.0
        frac = rest_drive_s / total_drive_s if total_drive_s > 0 else 0.0
        target_m = total_line_m * frac
        lat_r, lng_r = _interpolate_on_line(coords, cum, target_m)
        # optional snap to lodging
        pois = find_pois(lat_r, lng_r, "rest", radius_m=15000)
        coord = pois[0]["coord"] if pois else {"lat": lat_r, "lng": lng_r}

        stops.append(
            {
                "id": _id(),
                "type": "rest",
                "coord": coord,
                "etaIso": (start_dt + timedelta(seconds=rest_drive_s)).isoformat(),
                "durationMin": 600,  # 10h
                "poi": (
                    {"name": pois[0].get("name"), "tags": pois[0].get("tags")} if pois else {"name": None, "tags": {}}
                ),
                "note": "10h rest (11h daily drive cap)",
            }
        )
        # Not advancing `t` for the same reason as break; we’re keeping `t` as “arrival at drop” below.

    # Arrive dropoff (advance by leg2) and add 1h on-duty
    if leg2_s > 1:
        t += timedelta(seconds=leg2_s)
    stops.append(
        {
            "id": _id(),
            "type": "dropoff",
            "coord": {"lat": drop[1], "lng": drop[0]},
            "etaIso": t.isoformat(),
            "durationMin": 60,
            "note": "Dropoff (1h)",
        }
    )
    t += timedelta(hours=1)  # not used further, but kept for completeness

    # Build response
    resp = {
        "route": {k: route[k] for k in ("geometry", "distance_m", "duration_s", "bbox")},
        "stops": sorted(stops, key=lambda s: s["etaIso"]),  # ensure chronological order
        "stats": {
            "drive_hours_total": round(total_drive_s / 3600, 2),
            "duty_hours_total": round(total_drive_s / 3600 + 2.0, 2),  # +1h pickup +1h drop
            "off_hours_total": 10.0 if (total_drive_s / 3600.0) >= DAILY_DRIVE_CAP_H else 0.0,
            "fuel_stops": 1 if total_miles >= FUEL_EVERY_MILES else 0,
            "cycle_hours_used_after": d["currentCycleUsedHours"] + round(total_drive_s / 3600.0, 2),
        },
    }

    out = TripCalcResponseSer(data=resp)
    out.is_valid(raise_exception=True)
    return Response(out.data, status=200)
