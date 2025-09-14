from rest_framework import serializers


class LatLngSer(serializers.Serializer):
    lat = serializers.FloatField()
    lng = serializers.FloatField()


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


class TripCalcResponseSer(serializers.Serializer):
    route = RouteSer()
    stops = StopSer(many=True)
    stats = serializers.DictField()
