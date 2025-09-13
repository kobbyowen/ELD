from django.urls import path
from .views import signup, LoginView, logout, me

urlpatterns = [
    path("signup", signup, name="auth_signup"),
    path("login", LoginView.as_view(), name="auth_login"),
    path("logout", logout, name="auth_logout"),
    path("me", me, name="auth_me"),
]
