# api/trips/views.py
from datetime import timedelta
import uuid
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .serializers import TripCalcRequestSer, TripCalcResponseSer
from .services.routing import osrm_route
from .services.overpass import find_pois


def _id():
    return uuid.uuid4().hex


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def calculate_trip(request):
    ser = TripCalcRequestSer(data=request.data)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data

    pts = [
        (d["currentLocation"]["lng"], d["currentLocation"]["lat"]),
        (d["pickupLocation"]["lng"], d["pickupLocation"]["lat"]),
        (d["dropoffLocation"]["lng"], d["dropoffLocation"]["lat"]),
    ]
    route = osrm_route(pts)

    start = d["startTimeIso"]
    dur_s = route["duration_s"]

    stops = []
    stops.append(
        {
            "id": _id(),
            "type": "pickup",
            "coord": {"lat": pts[1][1], "lng": pts[1][0]},
            "etaIso": start,
            "durationMin": 60,
            "note": "Pickup (1h)",
        }
    )

    # Simple placements (placeholder until full HOS simulation)
    break_eta = start + timedelta(hours=5)
    fuel_eta = start + timedelta(hours=7.5)
    rest_eta = start + timedelta(hours=12)

    # Pick mid-geometry as snap seed; later replace with interpolation by time
    coords = route["geometry"]["coordinates"]
    mid = coords[len(coords) // 2] if coords else [pts[0][0], pts[0][1]]
    mid_lat, mid_lng = mid[1], mid[0]

    def snap(kind, eta, duration):
        pois = find_pois(mid_lat, mid_lng, kind, radius_m=15000)
        poi = pois[0] if pois else None
        return {
            "id": _id(),
            "type": kind,
            "coord": (poi["coord"] if poi else {"lat": mid_lat, "lng": mid_lng}),
            "etaIso": eta,
            "durationMin": duration,
            "poi": ({"name": poi.get("name"), "tags": poi.get("tags")} if poi else {"name": None, "tags": {}}),
        }

    stops.append(snap("break", break_eta, 30))
    stops.append(snap("fuel", fuel_eta, 20))
    stops.append(snap("rest", rest_eta, 600))

    drop_eta = start + timedelta(seconds=dur_s + 2 * 3600)
    stops.append(
        {
            "id": _id(),
            "type": "dropoff",
            "coord": {"lat": pts[2][1], "lng": pts[2][0]},
            "etaIso": drop_eta,
            "durationMin": 60,
            "note": "Dropoff (1h)",
        }
    )

    resp = {
        "route": {k: route[k] for k in ("geometry", "distance_m", "duration_s", "bbox")},
        "stops": stops,
        "stats": {
            "drive_hours_total": round(dur_s / 3600, 1),
            "duty_hours_total": round(dur_s / 3600 + 2.0, 1),
            "off_hours_total": 10.0,
            "fuel_stops": 1,
            "cycle_hours_used_after": d["currentCycleUsedHours"] + round(dur_s / 3600, 1),
        },
    }
    out = TripCalcResponseSer(data=resp)
    out.is_valid(raise_exception=True)
    return Response(out.data, status=200)
