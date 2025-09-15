from datetime import timedelta
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from trips.models import Trip

try:
    from ..models import DailyLog

    HAS_DAILY_LOG = True
except Exception:
    HAS_DAILY_LOG = False


def _trip_summary(trip):
    calc = trip.calc_payload or {}
    places = calc.get("places") or {}
    route = calc.get("route") or {}
    stats = calc.get("stats") or {}

    pickup_name = (places.get("pickup") or {}).get("name") or ""
    dropoff_name = (places.get("dropoff") or {}).get("name") or ""
    dist_m = route.get("distance_m") or 0
    dur_s = route.get("duration_s") or 0

    return {
        "id": str(trip.id),
        "created_at": trip.created_at,
        "pickup_location": pickup_name,
        "dropoff_location": dropoff_name,
        "status": "completed",
        "trip_distance_miles": round(dist_m / 1609.344, 1) if dist_m else None,
        "estimated_duration_min": round(dur_s / 60) if dur_s else None,
        "current_cycle_hours": stats.get("cycle_hours_used_after"),
    }


class DashboardAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = Trip.objects.filter(user=user).order_by("-created_at")

        total_trips = qs.count()
        completed_trips = total_trips
        active_trips = 0

        recent_trips = [_trip_summary(t) for t in qs[:5]]

        current_cycle_hours = None
        if recent_trips:
            for t in qs:
                s = (t.calc_payload or {}).get("stats") or {}
                v = s.get("cycle_hours_used_after")
                if isinstance(v, (int, float)):
                    current_cycle_hours = round(float(v), 1)
                    break

        recent_logs = []
        compliance_rate = None
        violations_this_week = 0

        if HAS_DAILY_LOG:

            now = timezone.now()
            week_ago = now - timedelta(days=7)
            logs_qs = (
                DailyLog.objects.filter(driver__user=user).order_by("-log_date")[:7]
                if hasattr(DailyLog, "driver")
                else DailyLog.objects.filter(user=user).order_by("-log_date")[:7]
            )

            for log in logs_qs:
                recent_logs.append(
                    {
                        "id": str(log.id),
                        "log_date": log.log_date,
                        "total_driving_time": getattr(log, "total_driving_time", None),
                        "total_on_duty_time": getattr(log, "total_on_duty_time", None),
                        "total_off_duty_time": getattr(log, "total_off_duty_time", None),
                        "cycle_hours_used": getattr(log, "cycle_hours_used", None),
                        "is_compliant": bool(getattr(log, "is_compliant", True)),
                        "violations": getattr(log, "violations", []) or [],
                    }
                )

            if recent_logs:
                compliant = sum(1 for l in recent_logs if l["is_compliant"])
                compliance_rate = round(100.0 * compliant / len(recent_logs))

            if hasattr(DailyLog, "log_date") and hasattr(DailyLog, "violations"):
                week_logs = (
                    DailyLog.objects.filter(log_date__gte=week_ago).filter(driver__user=user)
                    if hasattr(DailyLog, "driver")
                    else DailyLog.objects.filter(user=user, log_date__gte=week_ago)
                )

                violations_this_week = 0
                for lg in week_logs:
                    v = getattr(lg, "violations", []) or []
                    try:
                        violations_this_week += len(v)
                    except Exception:
                        violations_this_week += 0

        if compliance_rate is None:
            compliance_rate = 100 if total_trips else 0
        if current_cycle_hours is None:
            current_cycle_hours = 0

        data = {
            "stats": {
                "totalTrips": total_trips,
                "activeTrips": active_trips,
                "completedTrips": completed_trips,
                "currentCycleHours": current_cycle_hours,
                "complianceRate": compliance_rate,
                "violationsThisWeek": violations_this_week,
            },
            "recentTrips": recent_trips,
            "recentLogs": recent_logs,
        }
        return Response(data)
