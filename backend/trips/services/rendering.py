import io
import os
import re
import json
import zipfile
from datetime import datetime, timezone
from typing import List, Dict, Any

from django.conf import settings
from django.template.loader import render_to_string

from weasyprint import HTML
from PyPDF2 import PdfMerger


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _media_rel(*parts: str) -> str:
    root = os.path.abspath(settings.MEDIA_ROOT)
    safe_parts = [str(p).lstrip("/").strip() for p in parts]
    return os.path.abspath(os.path.join(root, *safe_parts))


def _media_url(*parts: str) -> str:
    return _media_rel(*parts)


SEG_LANES = ("OFF", "SB", "DRIVING", "ONDUTY")


def _parse_iso(iso: str) -> datetime:
    if iso.endswith("Z"):
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _mins(dt_end: datetime, dt_start: datetime) -> int:
    return max(0, int(round((dt_end - dt_start).total_seconds() / 60.0)))


def _fmt_hhmm(total_minutes: int) -> str:
    h = total_minutes // 60
    m = total_minutes % 60
    return f"{h}:{m:02d}"


def _bucket_date_str(bucket: Dict[str, Any]) -> str:
    return bucket.get("date", "")


def _same_ymd(dt: datetime, ymd: str) -> bool:
    try:
        y, m, d = map(int, ymd.split("-"))
        return (dt.year, dt.month, dt.day) == (y, m, d)
    except Exception:
        return False


def _totals_by_lane(segments: List[Dict[str, Any]]) -> Dict[str, int]:
    mins = {k: 0 for k in SEG_LANES}
    for s in segments or []:
        st = _parse_iso(s["startIso"])
        en = _parse_iso(s["endIso"])
        lane = s.get("status", "OFF")
        if lane not in mins:
            lane = "OFF"
        mins[lane] += _mins(en, st)
    return mins


def _driving_minutes(segments: List[Dict[str, Any]]) -> int:
    t = 0
    for s in segments or []:
        if s.get("status") == "DRIVING":
            t += _mins(_parse_iso(s["endIso"]), _parse_iso(s["startIso"]))
    return t


def _total_driving_minutes_whole_trip(day_buckets: List[Dict[str, Any]]) -> int:
    return sum(_driving_minutes(b.get("segments", [])) for b in day_buckets or [])


def _try_daily_miles(bucket: Dict[str, Any], calc: Dict[str, Any]) -> int:
    total_m = calc.get("distance_m")
    if not total_m:
        return 0
    total_miles = total_m / 1609.344
    day_drv_min = _driving_minutes(bucket.get("segments", []))
    all_drv_min = _total_driving_minutes_whole_trip(calc.get("dayBuckets", []))
    if day_drv_min <= 0 or all_drv_min <= 0:
        return 0
    miles = (day_drv_min / all_drv_min) * total_miles
    return int(round(miles))


def _stops_to_remarks_for_day(stops: List[Dict[str, Any]], day_ymd: str) -> str:
    def _label_for(stop: Dict[str, Any]) -> str:
        t = stop.get("type", "").lower()
        note = stop.get("note") or ""
        if t == "start":
            return "Start"
        if t == "pickup":
            return "Pickup"
        if t == "dropoff":
            return "Dropoff"
        if t == "break":
            return "Break"
        if t == "rest":
            return "Rest"
        if t == "fuel":
            return "Fuel"
        return note or t.capitalize()

    parts = []
    for s in stops or []:
        try:
            dt = _parse_iso(s["etaIso"])
            if _same_ymd(dt, day_ymd):
                parts.append(f'{_label_for(s)} {dt.strftime("%H:%M")}')
        except Exception:
            continue
    return " • ".join(parts)


def build_day_context(calc: Dict[str, Any], extras: Dict[str, Any], bucket: Dict[str, Any]) -> Dict[str, Any]:
    ymd = _bucket_date_str(bucket)
    try:
        date_display = datetime.fromisoformat(ymd).strftime("%m / %d / %Y")
    except Exception:
        date_display = ymd
    lane_mins = _totals_by_lane(bucket.get("segments", []))
    total_off_duty = _fmt_hhmm(lane_mins.get("OFF", 0))
    total_sleeper = _fmt_hhmm(lane_mins.get("SB", 0))
    total_driving = _fmt_hhmm(lane_mins.get("DRIVING", 0))
    total_onduty = _fmt_hhmm(lane_mins.get("ONDUTY", 0))
    miles_today = _try_daily_miles(bucket, calc)
    places = calc.get("places", {}) or {}
    carrier_name = extras.get("carrier_name") or ""
    main_office_address = extras.get("main_office_address") or ""
    vehicle_numbers = extras.get("vehicle_numbers") or extras.get("equipment_ids") or ""
    remarks_txt = _stops_to_remarks_for_day(calc.get("stops", []), ymd)
    ctx = {
        "page_title": f"Driver’s Daily Log — {date_display}",
        "date_display": date_display,
        "total_miles_driving_today": miles_today or extras.get("total_miles_driving_today", ""),
        "vehicle_numbers": vehicle_numbers,
        "carrier_name": carrier_name,
        "main_office_address": main_office_address,
        "driver_signature": extras.get("driver_signature", ""),
        "co_driver_name": extras.get("co_driver_name", ""),
        "start_time_display": extras.get("start_time_display", "00:00 (Home Terminal)"),
        "total_hours_display": extras.get("total_hours_display", ""),
        "total_off_duty": total_off_duty,
        "total_sleeper": total_sleeper,
        "total_driving": total_driving,
        "total_onduty": total_onduty,
        "remarks": remarks_txt,
        "shipping_no": extras.get("shipping_no", ""),
        "shipper_name": extras.get("shipper_name", places.get("pickup", {}).get("name", "")),
        "commodity": extras.get("commodity", ""),
        "day_bucket_json": json.dumps({"date": bucket.get("date"), "segments": bucket.get("segments", [])}),
    }
    return ctx


_GRADIENT_COLOR_TICK = "rgba(0,0,0,0.85)"
_GRADIENT_COLOR_HOUR = "rgba(0,0,0,0.90)"
_VAR_IN_GRADIENT_PATTERNS = [
    (r"var\(\s*--tick\s*\)", _GRADIENT_COLOR_TICK),
    (r"var\(\s*--hour\s*\)", _GRADIENT_COLOR_HOUR),
]


def _sanitize_for_weasy(html: str) -> str:
    out = html
    for pat, repl in _VAR_IN_GRADIENT_PATTERNS:
        out = re.sub(pat, repl, out, flags=re.IGNORECASE)
    return out


def render_and_store_logs(trip) -> List[Dict[str, Any]]:
    calc = trip.calc_payload or {}
    extras = getattr(trip, "extras", None) or {}
    day_buckets = (calc.get("dayBuckets") if isinstance(calc, dict) else None) or []
    results: List[Dict[str, Any]] = []

    base_subdir = os.path.join("trips", str(trip.id).strip(), "logs")
    out_dir = _media_rel(base_subdir)
    _ensure_dir(out_dir)

    base_url = (
        getattr(settings, "WEASYPRINT_BASE_URL", None) or getattr(settings, "STATIC_ROOT", None) or settings.MEDIA_ROOT
    )
    template_name = "trips/daily_log.html"

    per_day_pdf_paths: List[str] = []

    def _date_key(b):
        try:
            return datetime.fromisoformat(b.get("date", "1970-01-01"))
        except Exception:
            return datetime(1970, 1, 1)

    for bucket in sorted(day_buckets, key=_date_key):
        date_str = bucket.get("date") or "unknown"
        safe_date = date_str.replace("/", "-")
        html_filename = f"log-{safe_date}.html"
        pdf_filename = f"log-{safe_date}.pdf"
        html_path = os.path.join(out_dir, html_filename)
        pdf_path = os.path.join(out_dir, pdf_filename)
        html_url = _media_url(base_subdir, html_filename)
        pdf_url = _media_url(base_subdir, pdf_filename)

        context = build_day_context(calc, extras, bucket)
        html_str = render_to_string(template_name, context)
        html_for_weasy = _sanitize_for_weasy(html_str)

        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_str)

        HTML(string=html_for_weasy, base_url=base_url).write_pdf(pdf_path)

        per_day_pdf_paths.append(pdf_path)
        results.append(
            {
                "date": date_str,
                "html_path": html_path,
                "html_url": html_url,
                "pdf_path": pdf_path,
                "pdf_url": pdf_url,
            }
        )

    zip_html_name = "daily_logs_html.zip"
    zip_html_path = os.path.join(out_dir, zip_html_name)
    with zipfile.ZipFile(zip_html_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for r in results:
            zf.write(r["html_path"], arcname=os.path.basename(r["html_path"]))
    zip_html_url = _media_url(base_subdir, zip_html_name)

    zip_pdf_name = "daily_logs_pdf.zip"
    zip_pdf_path = os.path.join(out_dir, zip_pdf_name)
    with zipfile.ZipFile(zip_pdf_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for r in results:
            zf.write(r["pdf_path"], arcname=os.path.basename(r["pdf_path"]))
    zip_pdf_url = _media_url(base_subdir, zip_pdf_name)

    combined_pdf_name = "daily_logs_combined.pdf"
    combined_pdf_path = os.path.join(out_dir, combined_pdf_name)
    merger = PdfMerger()
    for p in per_day_pdf_paths:
        merger.append(p)
    with open(combined_pdf_path, "wb") as f:
        merger.write(f)
    merger.close()
    combined_pdf_url = _media_url(base_subdir, combined_pdf_name)

    results.append(
        {
            "zip_html_path": zip_html_path,
            "zip_html_url": zip_html_url,
            "zip_pdf_path": zip_pdf_path,
            "zip_pdf_url": zip_pdf_url,
            "combined_pdf_path": combined_pdf_path,
            "combined_pdf_url": combined_pdf_url,
        }
    )

    return results
