from django import forms
from .models import CodeSubmission


class CodeInputForm(forms.ModelForm):
    class Meta:
        model = CodeSubmission
        fields = ['title', 'language', 'source_code', 'file_upload']
        widgets = {
            'title': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Analysis title (e.g., "Sorting Algorithm")',
            }),
            'language': forms.Select(attrs={'class': 'form-select'}, choices=[
                ('python', 'Python'),
                ('javascript', 'JavaScript'),
                ('java', 'Java'),
                ('cpp', 'C++'),
                ('csharp', 'C#'),
                ('go', 'Go'),
                ('rust', 'Rust'),
            ]),
            'source_code': forms.Textarea(attrs={
                'class': 'form-control font-monospace',
                'rows': 15,
                'placeholder': 'Paste your Python source code here...',
                'id': 'code-editor',
            }),
            'file_upload': forms.FileInput(attrs={
                'class': 'form-control',
                'accept': '.py,.js,.java,.cpp,.c,.go,.rs',
            }),
        }


class SuitabilityForm(forms.Form):
    DOMAIN_CHOICES = [
        ('web_development', 'Web Development'),
        ('ai_ml', 'AI / Machine Learning'),
        ('mobile_development', 'Mobile Development'),
        ('systems_programming', 'Systems Programming'),
        ('embedded_systems', 'Embedded Systems'),
        ('game_development', 'Game Development'),
        ('scientific_computing', 'Scientific Computing'),
    ]

    domain = forms.ChoiceField(
        choices=DOMAIN_CHOICES,
        widget=forms.Select(attrs={'class': 'form-select'}),
    )
    runtime_efficiency = forms.IntegerField(
        min_value=1, max_value=10, initial=5,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'type': 'range', 'min': 1, 'max': 10}),
    )
    memory_overhead = forms.IntegerField(
        min_value=1, max_value=10, initial=5,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'type': 'range', 'min': 1, 'max': 10}),
    )
    concurrency_support = forms.IntegerField(
        min_value=1, max_value=10, initial=5,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'type': 'range', 'min': 1, 'max': 10}),
    )
    scalability = forms.IntegerField(
        min_value=1, max_value=10, initial=5,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'type': 'range', 'min': 1, 'max': 10}),
    )
    ecosystem_maturity = forms.IntegerField(
        min_value=1, max_value=10, initial=5,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'type': 'range', 'min': 1, 'max': 10}),
    )
    development_speed = forms.IntegerField(
        min_value=1, max_value=10, initial=5,
        widget=forms.NumberInput(attrs={'class': 'form-control', 'type': 'range', 'min': 1, 'max': 10}),
    )
