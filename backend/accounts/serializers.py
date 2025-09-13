from django.contrib.auth.models import User
from rest_framework import serializers
from accounts.models import DriverProfile


class UserSerializer(serializers.ModelSerializer):
    license_number = serializers.CharField(source="driver_profile.license_number", read_only=True)
    carrier_name = serializers.CharField(source="driver_profile.carrier_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "license_number", "carrier_name", "username"]


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6, write_only=True)
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    license_number = serializers.CharField()
    carrier_name = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already registered")
        return value

    def create(self, validated_data):
        email = validated_data["email"].lower()
        user = User.objects.create_user(
            username=email,
            email=email,
            password=validated_data["password"],
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
        )
        DriverProfile.objects.create(
            user=user,
            license_number=validated_data["license_number"],
            carrier_name=validated_data.get("carrier_name", ""),
        )
        return user
