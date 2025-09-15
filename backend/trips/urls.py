from django.urls import path
from .views import calculate_trip
from .views import TripListCreateView, TripRetrieveDestroyView


urlpatterns = [
    path("trip/calculate", calculate_trip, name="trip_calculate"),
    path("trips/<uuid:pk>", TripRetrieveDestroyView.as_view(), name="trip-detail"),
    path("trips", TripListCreateView.as_view(), name="trips"),
]
