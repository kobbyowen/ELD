from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.serializers import SignupSerializer, UserSerializer


class LoginView(TokenObtainPairView):

    def post(self, request, *args, **kwargs):
        data = request.data.copy()
        email = data.get("email")
        if email:
            data["username"] = email  # our username == email
        request._full_data = data  # map to what the parent expects

        response = super().post(request, *args, **kwargs)
        if response.status_code != 200:
            return response

        try:
            user = User.objects.get(email__iexact=email)
            response.data["user"] = UserSerializer(user).data
        except User.DoesNotExist:
            pass

        return response


@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    ser = SignupSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    ser.create(ser.validated_data)
    return Response({"message": "Account created successfully"}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    refresh = request.data.get("refresh")
    if not refresh:
        return Response({"error": "Missing refresh token"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        token = RefreshToken(refresh)
        token.blacklist()
    except Exception:
        return Response({"error": "Invalid refresh token"}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"message": "Logged out"}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """GET /api/auth/me"""
    return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
