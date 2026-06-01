from allauth.account.forms import SignupForm
from django import forms

from .models import UserProfile


class CustomSignupForm(SignupForm):
    role = forms.ChoiceField(
        choices=UserProfile.ROLE_CHOICES,
        initial=UserProfile.ROLE_STUDENT,
        widget=forms.Select,
    )

    def save(self, request):
        user = super().save(request)
        self._save_role(user)
        return user

    def signup(self, request, user):
        self._save_role(user)

    def _save_role(self, user):
        role = self.cleaned_data.get("role") or UserProfile.ROLE_STUDENT
        UserProfile.objects.update_or_create(user=user, defaults={"role": role})
