from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('student', 'Student'),
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='student')
    bio = models.TextField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    institution = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    def is_admin_user(self):
        return self.role == 'admin'

    def is_student(self):
        return self.role == 'student'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
