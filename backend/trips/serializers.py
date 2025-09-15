from rest_framework import serializers
from .models import TripCalcDraft, Trip, TripLogFile


class LatLngSer(serializers.Serializer):
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    name = serializers.CharField()


class TripCalcRequestSer(serializers.Serializer):
    currentLocation = LatLngSer()
    pickupLocation = LatLngSer()
    dropoffLocation = LatLngSer()
    currentCycleUsedHours = serializers.IntegerField(min_value=0, max_value=70)
    startTimeIso = serializers.DateTimeField()


class StopSer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.ChoiceField(choices=["pickup", "break", "fuel", "rest", "dropoff"])
    coord = LatLngSer()
    etaIso = serializers.DateTimeField()
    durationMin = serializers.IntegerField()
    poi = serializers.DictField(required=False)
    note = serializers.CharField(required=False, allow_blank=True)


class RouteSer(serializers.Serializer):
    geometry = serializers.JSONField()
    distance_m = serializers.IntegerField()
    duration_s = serializers.IntegerField()
    bbox = serializers.ListField(child=serializers.FloatField())


class CoordOutSer(serializers.Serializer):
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    name = serializers.CharField(required=False, allow_blank=True, default="")


class PlacesSer(serializers.Serializer):
    current = CoordOutSer()
    pickup = CoordOutSer()
    dropoff = CoordOutSer()


class TripCalcResponseSer(serializers.Serializer):
    draft_id = serializers.UUIDField()
    route = serializers.DictField()
    stops = serializers.ListField()
    stats = serializers.DictField()
    places = PlacesSer()


class TripCalcDraftSer(serializers.ModelSerializer):
    class Meta:
        model = TripCalcDraft
        fields = ["id", "user", "payload", "created_at", "is_logged"]
        read_only_fields = ["id", "user", "created_at", "is_logged"]


class TripLogFileSer(serializers.ModelSerializer):
    html_url = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()
    png_url = serializers.SerializerMethodField()

    class Meta:
        model = TripLogFile
        fields = ["page_index", "html_url", "pdf_url", "png_url"]

    def get_html_url(self, obj):
        return obj.html_file.url if obj.html_file else None

    def get_pdf_url(self, obj):
        return obj.pdf_file.url if obj.pdf_file else None

    def get_png_url(self, obj):
        return obj.png_file.url if obj.png_file else None


class TripSer(serializers.ModelSerializer):
    files = TripLogFileSer(many=True, source="logs", read_only=True)

    class Meta:
        model = Trip
        fields = ["id", "created_at", "calc_payload", "files"]
        read_only_fields = ["id", "created_at", "calc_payload", "files"]


class LogTripRequestSer(serializers.Serializer):
    draft_id = serializers.UUIDField()

    equipment_text = serializers.CharField(max_length=300, allow_blank=True, required=False)

    carrier_name = serializers.CharField(max_length=200, allow_blank=True, required=False)
    main_office_address = serializers.CharField(max_length=300, allow_blank=True, required=False)
    home_terminal_address = serializers.CharField(max_length=300, allow_blank=True, required=False)

    remarks = serializers.CharField(allow_blank=True, required=False)
    bl_or_manifest = serializers.CharField(max_length=200, allow_blank=True, required=False)
    shipper_commodity = serializers.CharField(max_length=300, allow_blank=True, required=False)
    additional_notes = serializers.CharField(max_length=300, allow_blank=True, required=False)

    recap_70_a_last7_incl_today = serializers.CharField(max_length=50, allow_blank=True, required=False)
    recap_70_b_available_tomorrow = serializers.CharField(max_length=50, allow_blank=True, required=False)


class LogTripResponseSer(serializers.Serializer):
    trip = TripSer()
