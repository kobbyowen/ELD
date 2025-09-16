from datetime import datetime, timedelta, timezone
import math
import uuid
from typing import List, Tuple
from .services.routing import osrm_route
from .services.overpass import find_pois

BREAK_AFTER_H = 8.0
DAILY_DRIVE_CAP_H = 11.0
FUEL_EVERY_MILES = 1000.0
FUEL_DURATION_MIN = 20
PICKUP_DURATION_MIN = 60
DROPOFF_DURATION_MIN = 60
REST_DURATION_MIN = 600  # 10h

EARTH_R = 6371000.0
FUEL_EVERY_MILES = 1000.0
BREAK_AFTER_H = 8.0
DAILY_DRIVE_CAP_H = 11.0


def _parse_iso(s: str) -> datetime:

    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def minutes_between(start_iso: str, end_iso: str, *, rounding: str = "floor") -> int:
    """
    Returns minutes between two ISO8601 datetimes.
    rounding: 'floor' | 'ceil' | 'nearest'
    """
    start = _parse_iso(start_iso)
    end = _parse_iso(end_iso)
    secs = (end - start).total_seconds()
    if rounding == "ceil":
        from math import ceil

        return int(ceil(secs / 60))
    if rounding == "nearest":
        from math import floor

        return int(floor((secs + 30) / 60))
    # default floor
    return int(secs // 60)


def _id() -> str:
    return uuid.uuid4().hex


def _fmt_time(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%m/%d/%Y, %H:%M")
    except Exception:
        return iso


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


# --- internal: clip one segment into day buckets
def _clip_segments_to_days(segments: list[dict]) -> list[dict]:
    """
    segments: [{"startIso","endIso","status","label?"}]
    Returns: [
      {"date": "YYYY-MM-DD", "segments": [ ...clipped to that day... ]},
      ...
    ]
    """
    from collections import defaultdict

    by_day = defaultdict(list)

    for seg in segments:
        s = datetime.fromisoformat(seg["startIso"].replace("Z", "+00:00"))
        e = datetime.fromisoformat(seg["endIso"].replace("Z", "+00:00"))
        status = seg["status"]
        label = seg.get("label")

        cur = s
        while cur < e:
            day_start = cur.replace(hour=0, minute=0, second=0, microsecond=0)
            next_midnight = day_start + timedelta(days=1)
            chunk_end = min(e, next_midnight)
            key = day_start.date().isoformat()
            stat_iso = cur.isoformat().replace("+00:00", "Z")
            end_iso = chunk_end.isoformat().replace("+00:00", "Z")
            by_day[key].append(
                {
                    "startIso": stat_iso,
                    "endIso": end_iso,
                    "minutesSpent": minutes_between(stat_iso, end_iso),
                    "status": status,
                    **({"label": label} if label else {}),
                }
            )
            cur = chunk_end

    # materialize ordered buckets by date
    out = []
    for day in sorted(by_day.keys()):
        # keep segments sorted by start time within the day
        out.append({"date": day, "segments": sorted(by_day[day], key=lambda x: x["startIso"])})
    return out


def plan_trip_payload(d: dict) -> dict:
    # ---- Inputs / locations
    cur = (d["currentLocation"]["lng"], d["currentLocation"]["lat"])
    pick = (d["pickupLocation"]["lng"], d["pickupLocation"]["lat"])
    drop = (d["dropoffLocation"]["lng"], d["dropoffLocation"]["lat"])
    start_dt = _parse_start(d["startTimeIso"])

    cur_name = d["currentLocation"].get("name", "") or ""
    pick_name = d["pickupLocation"].get("name", "") or ""
    drop_name = d["dropoffLocation"].get("name", "") or ""

    # ---- Route lookup
    route = osrm_route([cur, pick, drop])
    coords = route["geometry"]["coordinates"]
    total_dist_m = route["distance_m"]
    total_drive_s = route["duration_s"]

    total_line_m, cum = _route_distances_m(coords) if coords else (total_dist_m, [0.0])

    d1 = _haversine_m(cur[1], cur[0], pick[1], pick[0])
    d2 = _haversine_m(pick[1], pick[0], drop[1], drop[0])
    denom = d1 + d2 if (d1 + d2) > 0 else 1.0
    leg1_s = total_drive_s * (d1 / denom)

    interrupts = []

    interrupts.append(
        {
            "name": "Pickup (1h)",
            "type": "pickup",
            "drive_s": leg1_s,
            "dur_min": PICKUP_DURATION_MIN,
            "coord": {"lat": pick[1], "lng": pick[0]},
        }
    )

    # Break after 8h driving (if applicable)
    if total_drive_s / 3600.0 >= BREAK_AFTER_H:
        break_drive_s = BREAK_AFTER_H * 3600.0
        frac = break_drive_s / total_drive_s if total_drive_s > 0 else 0.0
        target_m = total_line_m * frac
        lat_b, lng_b = _interpolate_on_line(coords, cum, target_m)
        interrupts.append(
            {
                "name": "30m break (8h rule)",
                "type": "break",
                "drive_s": break_drive_s,
                "dur_min": 30,
                "coord": {"lat": lat_b, "lng": lng_b},
            }
        )

    # Fuel at 1000 miles (if applicable)
    total_miles = total_dist_m / 1609.344
    if total_miles >= FUEL_EVERY_MILES:
        fuel_target_m = min(total_line_m, 1609.344 * FUEL_EVERY_MILES)
        frac = fuel_target_m / total_line_m if total_line_m > 0 else 0.0
        fuel_drive_s = total_drive_s * frac
        lat_f, lng_f = _interpolate_on_line(coords, cum, fuel_target_m)
        pois = find_pois(lat_f, lng_f, "fuel", radius_m=15000)
        coord = pois[0]["coord"] if pois else {"lat": lat_f, "lng": lng_f}
        interrupts.append(
            {
                "name": "Fuel (20m)",
                "type": "fuel",
                "drive_s": fuel_drive_s,
                "dur_min": FUEL_DURATION_MIN,
                "coord": coord,
                "poi": (
                    {"name": pois[0].get("name"), "tags": pois[0].get("tags")} if pois else {"name": None, "tags": {}}
                ),
            }
        )

    # Rest at 11h driving (if applicable, i.e., multi-day trip)
    multi_day = total_drive_s / 3600.0 >= DAILY_DRIVE_CAP_H
    if multi_day:
        rest_drive_s = DAILY_DRIVE_CAP_H * 3600.0
        frac = rest_drive_s / total_drive_s if total_drive_s > 0 else 0.0
        target_m = total_line_m * frac
        lat_r, lng_r = _interpolate_on_line(coords, cum, target_m)
        pois = find_pois(lat_r, lng_r, "rest", radius_m=15000)
        coord = pois[0]["coord"] if pois else {"lat": lat_r, "lng": lng_r}
        interrupts.append(
            {
                "name": "10h rest (11h daily drive cap)",
                "type": "rest",
                "drive_s": rest_drive_s,
                "dur_min": REST_DURATION_MIN,
                "coord": coord,
                "poi": (
                    {"name": pois[0].get("name"), "tags": pois[0].get("tags")} if pois else {"name": None, "tags": {}}
                ),
            }
        )

    # Dropoff occurs after full driving complete
    interrupts.append(
        {
            "name": "Dropoff (1h)",
            "type": "dropoff",
            "drive_s": total_drive_s,
            "dur_min": DROPOFF_DURATION_MIN,
            "coord": {"lat": drop[1], "lng": drop[0]},
        }
    )

    # ---- Convert driving-progress to wall-clock ETA (add offsets of prior non-driving)
    interrupts.sort(key=lambda x: x["drive_s"])
    non_drive_offset = 0  # seconds accumulated from prior ONDUTY/OFF events
    stops = []
    for i, it in enumerate(interrupts):
        eta = start_dt + timedelta(seconds=it["drive_s"] + non_drive_offset)
        stop = {
            "id": _id(),
            "type": it["type"],
            "coord": it["coord"],
            "etaIso": eta.isoformat(),
            "durationMin": it["dur_min"],
            "note": it["name"],
        }
        if "poi" in it:
            stop["poi"] = it["poi"]
        stops.append(stop)

        # Add offset for all except the final "dropoff" (we still need its duration in ELD)
        non_drive_offset += it["dur_min"] * 60

    stops.insert(
        0,
        {
            "id": _id(),
            "type": "start",
            "coord": cur,
            "etaIso": str(d["startTimeIso"]),
            "durationMin": minutes_between(str(d["startTimeIso"]), str(stops[0]["etaIso"])),
            "note": "Start fro current location",
        },
    )

    # ---- Build ELD segments (DRIVING/ONDUTY/OFF) from start to end
    # We create gaps as DRIVING between events, and convert each event to ONDUTY/OFF.
    def iso(dt):
        return dt.isoformat().replace("+00:00", "Z") if dt.tzinfo else dt.isoformat() + "Z"

    segments = []
    cursor = start_dt  # current wall-clock pointer
    driven_so_far_s = 0.0

    def add_seg(s, e, status, label=None):
        if e <= s:
            return
        seg = {"startIso": iso(s), "endIso": iso(e), "status": status}
        if label:
            seg["label"] = label
        segments.append(seg)

    # Map event type to status
    def event_status(t):
        if t == "rest":
            return "OFF"
        return "ONDUTY"  # pickup, break, fuel, dropoff

    for ev in stops:
        ev_start = datetime.fromisoformat(ev["etaIso"])
        ev_end = ev_start + timedelta(minutes=ev["durationMin"])
        # Fill DRIVING from cursor until event start, but only up to the point we still have driving left.
        # Driving is total_drive_s distributed across the wall clock with interruptions inserted.
        # Compute theoretical driving left to place.
        if driven_so_far_s < total_drive_s and ev_start > cursor:
            # we can place up to (total_drive_s - driven_so_far_s) between cursor and ev_start
            gap_s = (ev_start - cursor).total_seconds()
            place_s = min(gap_s, total_drive_s - driven_so_far_s)
            if place_s > 0:
                add_seg(cursor, cursor + timedelta(seconds=place_s), "DRIVING")
                cursor += timedelta(seconds=place_s)
                driven_so_far_s += place_s
        # Now place the event as ONDUTY/OFF
        if ev_end > cursor:
            add_seg(
                cursor,
                ev_end,
                event_status(ev["type"]),
                (
                    "Break 30m"
                    if ev["type"] == "break"
                    else (
                        "Fuel 20m"
                        if ev["type"] == "fuel"
                        else (
                            "Pickup"
                            if ev["type"] == "pickup"
                            else "Dropoff" if ev["type"] == "dropoff" else "10h rest" if ev["type"] == "rest" else None
                        )
                    )
                ),
            )
            cursor = ev_end

    # If any residual driving remains after last event (edge-case), add it
    if driven_so_far_s < total_drive_s:
        rem_s = total_drive_s - driven_so_far_s
        add_seg(cursor, cursor + timedelta(seconds=rem_s), "DRIVING")
        cursor += timedelta(seconds=rem_s)
        driven_so_far_s += rem_s

    # ---- Clip to 24h buckets
    dayBuckets = _clip_segments_to_days(segments)

    # ---- Stats (match your format)
    total_drive_h = round(total_drive_s / 3600.0, 2)
    duty_hours_total = round(total_drive_h + (PICKUP_DURATION_MIN + DROPOFF_DURATION_MIN) / 60.0, 2)
    off_hours_total = 10.0 if (total_drive_s / 3600.0) >= DAILY_DRIVE_CAP_H else 0.0
    fuel_stops = 1 if total_miles >= FUEL_EVERY_MILES else 0

    resp = {
        "route": {k: route[k] for k in ("geometry", "distance_m", "duration_s", "bbox")},
        "stops": sorted(stops, key=lambda s: s["etaIso"]),
        "places": {
            "current": {"name": cur_name, "lat": d["currentLocation"]["lat"], "lng": d["currentLocation"]["lng"]},
            "pickup": {"name": pick_name, "lat": d["pickupLocation"]["lat"], "lng": d["pickupLocation"]["lng"]},
            "dropoff": {"name": drop_name, "lat": d["dropoffLocation"]["lat"], "lng": d["dropoffLocation"]["lng"]},
        },
        "stats": {
            "drive_hours_total": total_drive_h,
            "duty_hours_total": duty_hours_total,
            "off_hours_total": off_hours_total,
            "fuel_stops": fuel_stops,
            "cycle_hours_used_after": d["currentCycleUsedHours"] + total_drive_h,
        },
        "dayBuckets": dayBuckets,
    }
    return resp
