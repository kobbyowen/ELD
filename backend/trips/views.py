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

from django.shortcuts import get_object_or_404


from .serializers import LogTripRequestSer
from .services.rendering import render_and_store_logs

from .serializers import TripSer


from pathlib import Path
import shutil

from django.db.models import QuerySet
from rest_framework.views import APIView


from .models import Trip, TripCalcDraft, TripLogFile


EARTH_R = 6371000.0
FUEL_EVERY_MILES = 1000.0
BREAK_AFTER_H = 8.0
DAILY_DRIVE_CAP_H = 11.0


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


def _derive_extras(user, draft_payload: dict) -> dict:
    route = draft_payload.get("route", {})
    stops = draft_payload.get("stops", [])
    stats = draft_payload.get("stats", {})

    def _stop_name(t: str):
        s = next((x for x in stops if x.get("type") == t), None)
        if not s:
            return ""
        nm = (s.get("poi") or {}).get("name") or s.get("note") or t.title()
        if nm:
            return nm
        coord = s.get("coord") or {}
        return f"{coord.get('lat', '')},{coord.get('lng', '')}"

    from_location = _stop_name("pickup")
    to_location = _stop_name("dropoff")

    log_date = None
    if stops:
        try:
            log_date = datetime.fromisoformat(stops[0]["etaIso"].replace("Z", "+00:00")).date()
        except Exception:
            pass

    remarks = " • ".join(f"{x['type'].title()} @ {_fmt_time(x['etaIso'])}" for x in stops)

    miles = round((route.get("distance_m", 0) / 1609.344), 1)
    on_duty_today = f"{round(stats.get('duty_hours_total', 0), 1)}h"

    return {
        "log_date": (log_date or datetime.utcnow().date()).isoformat(),
        "from_location": from_location,
        "to_location": to_location,
        "total_miles_driving_today": f"{miles}",
        "total_mileage_today": f"{miles}",
        "equipment_text": "",
        "carrier_name": "",
        "main_office_address": "",
        "home_terminal_address": "",
        "remarks": remarks,
        "bl_or_manifest": "",
        "shipper_commodity": "",
        "additional_notes": "",
        "on_duty_hours_today": on_duty_today,
        "recap_70_a_last7_incl_today": "",
        "recap_70_b_available_tomorrow": "",
        "driver_name": getattr(user, "full_name", "") or getattr(user, "email", ""),
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def calculate_trip(request):
    ser = TripCalcRequestSer(data=request.data)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data

    cur = (d["currentLocation"]["lng"], d["currentLocation"]["lat"])
    pick = (d["pickupLocation"]["lng"], d["pickupLocation"]["lat"])
    drop = (d["dropoffLocation"]["lng"], d["dropoffLocation"]["lat"])
    start_dt = _parse_start(d["startTimeIso"])

    cur_name = d["currentLocation"].get("name", "") or ""
    pick_name = d["pickupLocation"].get("name", "") or ""
    drop_name = d["dropoffLocation"].get("name", "") or ""

    route = osrm_route([cur, pick, drop])
    coords = route["geometry"]["coordinates"]
    total_dist_m = route["distance_m"]
    total_drive_s = route["duration_s"]

    total_line_m, cum = _route_distances_m(coords) if coords else (total_dist_m, [0.0])

    d1 = _haversine_m(cur[1], cur[0], pick[1], pick[0])
    d2 = _haversine_m(pick[1], pick[0], drop[1], drop[0])
    denom = d1 + d2 if (d1 + d2) > 0 else 1.0
    leg1_s = total_drive_s * (d1 / denom)
    leg2_s = total_drive_s - leg1_s

    t = start_dt
    stops = []

    if leg1_s > 1:
        t += timedelta(seconds=leg1_s)

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

    if (leg1_s + leg2_s) / 3600.0 >= BREAK_AFTER_H:
        break_drive_s_from_start = BREAK_AFTER_H * 3600.0
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

    total_miles = total_dist_m / 1609.344
    if total_miles >= FUEL_EVERY_MILES:
        fuel_target_m = min(total_line_m, 1609.344 * FUEL_EVERY_MILES)
        frac = fuel_target_m / total_line_m if total_line_m > 0 else 0.0
        fuel_drive_s = total_drive_s * frac
        lat_f, lng_f = _interpolate_on_line(coords, cum, fuel_target_m)

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

    if (leg1_s + leg2_s) / 3600.0 >= DAILY_DRIVE_CAP_H:
        rest_drive_s = DAILY_DRIVE_CAP_H * 3600.0
        frac = rest_drive_s / total_drive_s if total_drive_s > 0 else 0.0
        target_m = total_line_m * frac
        lat_r, lng_r = _interpolate_on_line(coords, cum, target_m)

        pois = find_pois(lat_r, lng_r, "rest", radius_m=15000)
        coord = pois[0]["coord"] if pois else {"lat": lat_r, "lng": lng_r}

        stops.append(
            {
                "id": _id(),
                "type": "rest",
                "coord": coord,
                "etaIso": (start_dt + timedelta(seconds=rest_drive_s)).isoformat(),
                "durationMin": 600,
                "poi": (
                    {"name": pois[0].get("name"), "tags": pois[0].get("tags")} if pois else {"name": None, "tags": {}}
                ),
                "note": "10h rest (11h daily drive cap)",
            }
        )

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
    t += timedelta(hours=1)

    resp = {
        "route": {k: route[k] for k in ("geometry", "distance_m", "duration_s", "bbox")},
        "stops": sorted(stops, key=lambda s: s["etaIso"]),
        "places": {
            "current": {"name": cur_name, "lat": d["currentLocation"]["lat"], "lng": d["currentLocation"]["lng"]},
            "pickup": {"name": pick_name, "lat": d["pickupLocation"]["lat"], "lng": d["pickupLocation"]["lng"]},
            "dropoff": {"name": drop_name, "lat": d["dropoffLocation"]["lat"], "lng": d["dropoffLocation"]["lng"]},
        },
        "stats": {
            "drive_hours_total": round(total_drive_s / 3600, 2),
            "duty_hours_total": round(total_drive_s / 3600 + 2.0, 2),
            "off_hours_total": 10.0 if (total_drive_s / 3600.0) >= DAILY_DRIVE_CAP_H else 0.0,
            "fuel_stops": 1 if total_miles >= FUEL_EVERY_MILES else 0,
            "cycle_hours_used_after": d["currentCycleUsedHours"] + round(total_drive_s / 3600.0, 2),
        },
    }

    draft = TripCalcDraft.objects.create(user=request.user, payload=resp)

    draft.save()

    resp_with_id = {**resp, "draft_id": draft.id}
    out = TripCalcResponseSer(data=resp_with_id)

    out.is_valid(raise_exception=True)

    return Response(out.data, status=200)


def _safe_sort(sort: str | None) -> str:
    """
    Allow ?sort=created|-created|updated|-updated (default -created).
    """
    allowed = {
        "created": "created_at",
        "-created": "-created_at",
        "updated": "updated_at",
        "-updated": "-updated_at",
    }
    return allowed.get((sort or "").lower(), "-created_at")


def _user_trips(qs: QuerySet[Trip], user) -> QuerySet[Trip]:
    return qs.filter(user=user)


def _delete_trip_files(trip: Trip) -> None:
    """
    Remove files on disk and DB rows in TripLogFile (then Trip row).
    Assumes your files live under MEDIA_ROOT/trips/<trip.id>/...
    """

    try:
        from django.conf import settings

        dir_path = Path(settings.MEDIA_ROOT) / "trips" / str(trip.id)
        if dir_path.exists():
            shutil.rmtree(dir_path, ignore_errors=True)
    except Exception:
        pass
    TripLogFile.objects.filter(trip=trip).delete()


class TripListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        List trips for the current user.
        ?sort=created|-created|updated|-updated (default -created)
        Optional pagination: ?limit=20&offset=0
        """
        sort = _safe_sort(request.query_params.get("sort"))
        limit = int(request.query_params.get("limit", 50))
        offset = int(request.query_params.get("offset", 0))

        qs = _user_trips(Trip.objects.all(), request.user).order_by(sort)
        total = qs.count()
        items = qs[offset : offset + limit]
        data = TripSer(items, many=True).data
        return Response({"count": total, "results": data})

    def post(self, request):
        """
        Create/log a trip from a draft. Body is the *minimal* LogTripRequestSer:
        {
          "draft_id": "uuid",
          "log_date": "YYYY-MM-DD",
          "from_location": "string",
          "to_location": "string",
          "equipment_text": "",
          "carrier_name": "",
          "main_office_address": "",
          "home_terminal_address": "",
          "remarks": "",
          "bl_or_manifest": "",
          "shipper_commodity": "",
          "additional_notes": "",
          "recap_70_a_last7_incl_today": "",
          "recap_70_b_available_tomorrow": "",
          "driver_name": ""
        }
        """
        ser = LogTripRequestSer(data=request.data)
        ser.is_valid(raise_exception=True)
        draft_id = ser.validated_data["draft_id"]

        draft = get_object_or_404(TripCalcDraft, id=draft_id, user=request.user)
        if draft.is_logged:
            return Response({"detail": "Draft already logged."}, status=status.HTTP_409_CONFLICT)

        trip = Trip.objects.create(
            user=request.user,
            calc_payload=draft.payload,
            extras={k: v for k, v in ser.validated_data.items() if k != "draft_id"},
        )

        trip.save()
        files = render_and_store_logs(trip)

        out = TripSer(trip).data
        out["files"] = files

        draft.is_logged = True
        draft.save(update_fields=["is_logged"])

        return Response(out, status=status.HTTP_201_CREATED)


class TripRetrieveDestroyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """
        Retrieve a single trip (with files if your TripSer exposes them).
        """

        trip = get_object_or_404(_user_trips(Trip.objects, request.user), pk=pk)
        data = TripSer(trip).data

        files = [
            {
                "page_index": f.page_index,
                "html_url": f.html_url,
                "pdf_url": f.pdf_url,
                "png_url": f.png_url,
            }
            for f in TripLogFile.objects.filter(trip=trip).order_by("page_index")
        ]
        data["files"] = files
        return Response(data)

    def delete(self, request, pk):
        """
        Delete a trip and its generated files.
        """
        trip = get_object_or_404(_user_trips(Trip.objects, request.user), pk=pk)
        _delete_trip_files(trip)
        trip.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
