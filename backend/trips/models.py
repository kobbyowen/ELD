import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class TripCalcDraft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trip_calc_drafts")
    payload = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)
    is_logged = models.BooleanField(default=False)


class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    calc_payload = models.JSONField()
    extras = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class TripFile(models.Model):
    FORMAT_CHOICES = [
        ("pdf", "PDF"),
        ("png", "PNG"),
        ("html", "HTML"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="files")
    page_index = models.PositiveIntegerField()  # 0-based
    fmt = models.CharField(max_length=10, choices=FORMAT_CHOICES)
    storage_path = models.CharField(max_length=512)  # path within Django storage
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["trip", "fmt", "page_index"]),
        ]
        ordering = ["page_index"]


class TripLogFile(models.Model):
    """
    One row per generated log page (day).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="logs")
    page_index = models.IntegerField()
    html_file = models.FileField(upload_to="trips/%Y/%m/%d/html/", null=True, blank=True)
    pdf_file = models.FileField(upload_to="trips/%Y/%m/%d/pdf/", null=True, blank=True)
    png_file = models.FileField(upload_to="trips/%Y/%m/%d/png/", null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
