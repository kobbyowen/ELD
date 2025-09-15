# trips/services/rendering.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.template.loader import render_to_string

from ..models import TripFile


try:
    from weasyprint import HTML

    HAS_WEASYPRINT = True
except Exception:
    HAS_WEASYPRINT = False


def _mi(meters: float) -> float:
    return meters / 1609.344 if meters is not None else 0.0


def _build_display(calc: dict, extras: dict, page_meta: dict) -> dict:
    """
    Merge user-provided 'extras' with safe defaults from 'calc' for printing.
    page_meta: {"date": "YYYY-MM-DD", "tz": "..."} so we can show that day’s date.
    """
    places = (calc or {}).get("places", {}) or {}

    print(calc, extras, page_meta, places)

    default_from = places.get("from", {}).get("name") or places.get("current", {}).get("name") or ""
    default_to = places.get("to", {}).get("name") or places.get("dropoff", {}).get("name") or ""

    dist_mi = round(_mi((calc.get("route") or {}).get("distance_m", 0.0)), 1)

    d = {
        "log_date": extras.get("log_date") or page_meta.get("date") or "",
        "from_location": extras.get("from_location") or default_from,
        "to_location": extras.get("to_location") or default_to,
        "total_miles_driving_today": extras.get("total_miles_driving_today") or f"{dist_mi}",
        "total_mileage_today": extras.get("total_mileage_today") or "",
        "equipment_text": extras.get("equipment_text") or "",
        "carrier_name": extras.get("carrier_name") or "",
        "main_office_address": extras.get("main_office_address") or "",
        "home_terminal_address": extras.get("home_terminal_address") or "",
        "remarks": extras.get("remarks") or "",
        "bl_or_manifest": extras.get("bl_or_manifest") or "",
        "shipper_commodity": extras.get("shipper_commodity") or "",
        "additional_notes": extras.get("additional_notes") or "",
        "on_duty_hours_today": extras.get("on_duty_hours_today") or "",
        "recap_70_a_last7_incl_today": extras.get("recap_70_a_last7_incl_today") or "",
        "recap_70_b_available_tomorrow": extras.get("recap_70_b_available_tomorrow") or "",
    }

    print(d)

    return d


def _storage_path(trip_id, page_idx: int, ext: str) -> str:
    return str(PurePosixPath("trips") / str(trip_id) / f"log-{page_idx}.{ext}")


def _save_storage(path: str, data: bytes) -> str:
    if default_storage.exists(path):
        default_storage.delete(path)
    default_storage.save(path, ContentFile(data))
    return path


def _render_html_page(context: dict) -> bytes:

    html = render_to_string("trips/daily_log.html", context)
    return html.encode("utf-8")


def _render_pdf_from_html(html_bytes: bytes, base_url: str) -> bytes | None:
    if not HAS_WEASYPRINT:
        return None
    pdf_io = BytesIO()
    HTML(string=html_bytes.decode("utf-8"), base_url=base_url).write_pdf(pdf_io)
    return pdf_io.getvalue()


def _render_png_from_html(html_bytes: bytes, base_url: str) -> bytes | None:
    if not HAS_WEASYPRINT:
        return None
    try:
        png_io = BytesIO()
        HTML(string=html_bytes.decode("utf-8"), base_url=base_url).write_png(png_io)
        return png_io.getvalue()
    except Exception:
        return None


def _parse_iso(s: str) -> datetime:

    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


@dataclass
class DayWindow:
    local_start: datetime
    local_end: datetime


def _day_windows_for_stops(stops: list[dict[str, Any]], tzname: str) -> list[DayWindow]:
    """Build contiguous 24h windows covering all stop ETAs, in the provided tz."""
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(tzname)
    if not stops:

        now = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        return [DayWindow(now, now + timedelta(days=1))]

    local_times = [_parse_iso(s["etaIso"]).astimezone(tz) for s in stops if "etaIso" in s]
    start = min(local_times)
    end = max(local_times)

    first_midnight = start.replace(hour=0, minute=0, second=0, microsecond=0)
    last_midnight = end.replace(hour=0, minute=0, second=0, microsecond=0)

    windows: list[DayWindow] = []
    cur = first_midnight
    while cur <= last_midnight:
        windows.append(DayWindow(cur, cur + timedelta(days=1)))
        cur += timedelta(days=1)

    return windows


def _slice_stops_for_window(stops: list[dict[str, Any]], win: DayWindow, tzname: str) -> list[dict[str, Any]]:
    """Return stops whose etaIso falls within the given 24h local window."""
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(tzname)
    out: list[dict[str, Any]] = []
    for s in stops:
        dt = _parse_iso(s["etaIso"]).astimezone(tz)
        if win.local_start <= dt < win.local_end:
            out.append(s)

    out.sort(key=lambda x: x["etaIso"])
    return out


def split_into_daily_pages(base_context: dict) -> list[dict]:
    """
    Split the calculation payload into 24-hour pages based on local (home terminal) timezone.
    - Looks for tz in extras: x.home_tz (e.g., "America/Chicago"), defaults to "UTC".
    - Each page gets:
        page.index, page.count
        page.date (YYYY-MM-DD in local tz)
        calc_page.stops (subset for the day)
    """
    calc = (base_context or {}).get("calc", {}) or {}
    extras = (base_context or {}).get("x", {}) or {}

    tzname = extras.get("home_tz") or extras.get("tz") or "UTC"
    stops = calc.get("stops", []) or []

    windows = _day_windows_for_stops(stops, tzname)
    pages: list[dict] = []

    total_pages = len(windows)
    for idx, win in enumerate(windows):
        day_stops = _slice_stops_for_window(stops, win, tzname)

        ctx = {
            "calc": calc,
            "x": extras,
            "page": {
                "index": idx,
                "count": total_pages,
                "date": win.local_start.date().isoformat(),
                "local_start_iso": win.local_start.isoformat(),
                "local_end_iso": win.local_end.isoformat(),
                "tz": tzname,
            },
            "calc_page": {
                **calc,
                "stops": day_stops,
            },
        }
        pages.append(ctx)

    # If no stops, still return a single page
    if not pages:
        pages = [base_context]

    return pages


def render_and_store_logs(trip) -> list[dict]:
    calc = trip.calc_payload or {}
    extras = trip.extras or {}
    base_context = {"calc": calc, "x": extras}
    pages_context = split_into_daily_pages(base_context)
    results: list[dict] = []
    base_url = getattr(settings, "WEASYPRINT_BASE_URL", None) or getattr(settings, "MEDIA_URL", "/")

    for page_idx, ctx in enumerate(pages_context):
        page_meta = ctx.get("page", {})
        ctx["display"] = _build_display(calc, extras, page_meta)

        html_bytes = _render_html_page(ctx)
        html_path = _storage_path(trip.id, page_idx, "html")
        _save_storage(html_path, html_bytes)
        TripFile.objects.update_or_create(
            trip=trip,
            page_index=page_idx,
            fmt="html",
            defaults={"storage_path": html_path},
        )

        pdf_url = ""
        pdf_bytes = _render_pdf_from_html(html_bytes, base_url=base_url)
        if pdf_bytes:
            pdf_path = _storage_path(trip.id, page_idx, "pdf")
            _save_storage(pdf_path, pdf_bytes)
            TripFile.objects.update_or_create(
                trip=trip,
                page_index=page_idx,
                fmt="pdf",
                defaults={"storage_path": pdf_path},
            )
            pdf_url = default_storage.url(pdf_path)

        png_url = ""
        png_bytes = _render_png_from_html(html_bytes, base_url=base_url)
        if png_bytes:
            png_path = _storage_path(trip.id, page_idx, "png")
            _save_storage(png_path, png_bytes)
            TripFile.objects.update_or_create(
                trip=trip,
                page_index=page_idx,
                fmt="png",
                defaults={"storage_path": png_path},
            )
            png_url = default_storage.url(png_path)

        results.append(
            {
                "page_index": page_idx,
                "html_url": default_storage.url(html_path),
                "pdf_url": pdf_url,
                "png_url": png_url,
            }
        )
    return results
