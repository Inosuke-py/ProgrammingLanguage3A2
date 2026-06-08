from django.db import models
from accounts.models import User


class CodeSubmission(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='submissions')
    title = models.CharField(max_length=200)
    language = models.CharField(max_length=50, default='python')
    source_code = models.TextField()
    file_upload = models.FileField(upload_to='uploads/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} by {self.user.username}"


class AnalysisReport(models.Model):
    ANALYSIS_TYPES = (
        ('bytecode', 'Bytecode Analysis'),
        ('caching', 'Inline Caching'),
        ('optimization', 'Compiler Optimization'),
        ('hotpath', 'Hot Path Detection'),
        ('runtime', 'Runtime Efficiency'),
        ('concurrency', 'Concurrency Analysis'),
        ('memory', 'Memory Analysis'),
        ('suitability', 'Suitability Recommendation'),
    )
    submission = models.ForeignKey(CodeSubmission, on_delete=models.CASCADE, related_name='reports')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports')
    analysis_type = models.CharField(max_length=20, choices=ANALYSIS_TYPES)
    results = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_analysis_type_display()} - {self.submission.title}"
