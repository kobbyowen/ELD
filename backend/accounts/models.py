from django.db import models
from django.contrib.auth.models import User


class DriverProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="driver_profile")
    license_number = models.CharField(max_length=128)
    carrier_name = models.CharField(max_length=255, blank=True, default="")

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.license_number}"
