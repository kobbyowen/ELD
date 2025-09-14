# api/trips/services/routing.py
import httpx

OSRM = "https://router.project-osrm.org"


def osrm_route(points):  # points: [(lng,lat), ...]
    coords = ";".join([f"{lng},{lat}" for lng, lat in points])
    url = f"{OSRM}/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true&annotations=distance,duration"
    with httpx.Client(timeout=20) as client:
        r = client.get(url, headers={"User-Agent": "eld-app/1.0"})
        r.raise_for_status()
        data = r.json()
    route = data["routes"][0]
    geom = route["geometry"]  # GeoJSON LineString
    dist = int(route["distance"])
    dur = int(route["duration"])
    bbox = route.get("bbox") or []
    return {"geometry": geom, "distance_m": dist, "duration_s": dur, "bbox": bbox, "raw": route}
