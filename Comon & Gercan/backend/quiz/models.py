from django.db import models
from django.urls import reverse
from django.conf import settings
from django.contrib.auth.models import Group


class UserProfile(models.Model):
    ROLE_STUDENT = "student"
    ROLE_INSTRUCTOR = "instructor"
    ROLE_CHOICES = [
        (ROLE_STUDENT, "Student"),
        (ROLE_INSTRUCTOR, "Instructor"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STUDENT)

    def __str__(self):
        return f"{self.user} ({self.get_role_display()})"


class Quiz(models.Model):
    DIFFICULTY_CHOICES = [
        ("fundamentals", "Fundamentals"),
        ("applied", "Applied"),
        ("advanced", "Advanced"),
    ]

    title = models.CharField(max_length=120)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name="quizzes",
    )
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES)
    topics = models.JSONField(default=list)
    questions = models.JSONField(default=list)
    time_limit_seconds = models.PositiveIntegerField(default=5)
    pass_mark = models.PositiveIntegerField(default=60)
    assigned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="assigned_quizzes",
    )
    assigned_groups = models.ManyToManyField(
        Group,
        blank=True,
        related_name="assigned_quizzes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("quiz:detail", kwargs={"pk": self.pk})


class QuizAttempt(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts")
    score = models.PositiveIntegerField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    completion_time_seconds = models.PositiveIntegerField(default=0)
    details = models.JSONField(default=list)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_at"]

    @property
    def percentage(self):
        if not self.total_questions:
            return 0
        return round((self.score / self.total_questions) * 100)

    @property
    def passed(self):
        return self.percentage >= self.quiz.pass_mark
