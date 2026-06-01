from django.contrib import admin

from .models import Quiz, QuizAttempt, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role")
    list_filter = ("role",)
    search_fields = ("user__username", "user__email")


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "difficulty", "time_limit_seconds", "pass_mark", "created_at")
    list_filter = ("difficulty", "created_at")
    search_fields = ("title",)
    filter_horizontal = ("assigned_users", "assigned_groups")


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("quiz", "user", "score", "total_questions", "completion_time_seconds", "completed_at")
    list_filter = ("completed_at", "quiz")
    search_fields = ("quiz__title", "user__username", "user__email")
