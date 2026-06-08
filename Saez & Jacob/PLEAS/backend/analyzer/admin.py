from django.contrib import admin
from .models import CodeSubmission, AnalysisReport


@admin.register(CodeSubmission)
class CodeSubmissionAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'language', 'created_at')
    list_filter = ('language', 'created_at')
    search_fields = ('title', 'user__username')


@admin.register(AnalysisReport)
class AnalysisReportAdmin(admin.ModelAdmin):
    list_display = ('submission', 'user', 'analysis_type', 'created_at')
    list_filter = ('analysis_type', 'created_at')
    search_fields = ('submission__title', 'user__username')
