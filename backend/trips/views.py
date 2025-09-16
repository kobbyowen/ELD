from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse, Http404
from django.urls import reverse
from .serializers import TripCalcRequestSer, TripCalcResponseSer


from django.shortcuts import get_object_or_404
from django.conf import settings


from .serializers import LogTripRequestSer
from .services.rendering import render_and_store_logs

from .serializers import TripSer


from pathlib import Path
import shutil

from django.db.models import QuerySet
from rest_framework.views import APIView


from .models import Trip, TripCalcDraft, TripLogFile
from .helpers import plan_trip_payload


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def calculate_trip(request):
    ser = TripCalcRequestSer(data=request.data)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data

    resp = plan_trip_payload(d)

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
        trip = get_object_or_404(_user_trips(Trip.objects, request.user), pk=pk)
        data = TripSer(trip).data

        dl_base = reverse("trip-download", kwargs={"pk": pk})
        html_zip = request.build_absolute_uri(f"{dl_base}?format=html")
        pdf_zip = request.build_absolute_uri(f"{dl_base}?format=pdf")

        data["files"] = {
            "html_zip_url": html_zip,
            "pdf_zip_url": pdf_zip,
        }
        return Response(data)

    def delete(self, request, pk):
        """
        Delete a trip and its generated files.
        """
        trip = get_object_or_404(_user_trips(Trip.objects, request.user), pk=pk)
        _delete_trip_files(trip)
        trip.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TripDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        fmt = (request.query_params.get("format") or "pdf").lower()
        if fmt not in ("html", "pdf"):
            return Response({"detail": "format must be html or pdf"}, status=status.HTTP_400_BAD_REQUEST)

        trip = get_object_or_404(Trip.objects.filter(user=request.user), pk=pk)

        base_dir = Path(settings.MEDIA_ROOT) / "trips" / str(trip.id).strip() / "logs"
        zip_name = "daily_logs_html.zip" if fmt == "html" else "daily_logs_pdf.zip"
        zip_path = base_dir / zip_name

        if not zip_path.exists():
            try:
                render_and_store_logs(trip)
            except Exception:
                pass

        if not zip_path.exists():
            raise Http404("Requested zip not found")

        resp = FileResponse(open(zip_path, "rb"), content_type="application/zip")
        resp["Content-Disposition"] = f'attachment; filename="trip-{trip.id}-{fmt}.zip"'
        resp["Content-Length"] = zip_path.stat().st_size
        return resp
