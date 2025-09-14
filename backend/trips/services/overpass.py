# api/trips/services/overpass.py
import httpx

OVERPASS = "https://overpass-api.de/api/interpreter"


def _query(lat, lng, radius_m, kind):
    if kind in ("break", "rest"):
        filt = '(node["amenity"~"rest_area|parking"]["hgv"~"yes|designated"];way["highway"~"services|rest_area"];);'
    elif kind == "fuel":
        filt = '(node["amenity"="fuel"]["fuel:diesel"!="no"];);'
    else:
        return None
    return f"""
    [out:json][timeout:25];
    (
      {filt}
    )->.a;
    .a(around:{int(radius_m)},{lat},{lng});
    out center 15;
    """


def find_pois(lat, lng, kind, radius_m=15000):
    q = _query(lat, lng, radius_m, kind)
    if not q:
        return []
    with httpx.Client(timeout=30) as client:
        r = client.post(OVERPASS, data={"data": q}, headers={"User-Agent": "eld-app/1.0"})
        if r.status_code != 200:
            return []
        elements = r.json().get("elements", [])
    pois = []
    for e in elements:
        tags = e.get("tags", {})
        if "center" in e:
            clat, clng = e["center"]["lat"], e["center"]["lon"]
        else:
            clat, clng = e.get("lat"), e.get("lon")
        if clat is None or clng is None:
            continue
        pois.append(
            {"id": str(e.get("id")), "name": tags.get("name"), "coord": {"lat": clat, "lng": clng}, "tags": tags}
        )
    return pois
