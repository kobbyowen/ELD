from django.urls import path
from .views import calculate_trip

urlpatterns = [path("trip/calculate", calculate_trip, name="trip_calculate")]
