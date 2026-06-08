from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST
import contextlib
import io
import json
import traceback

from .models import CodeSubmission, AnalysisReport
from .forms import CodeInputForm, SuitabilityForm
from .utils.bytecode_analyzer import analyze_bytecode, get_nested_bytecode
from .utils.caching_analyzer import simulate_inline_caching
from .utils.optimization_analyzer import analyze_optimizations
from .utils.hotpath_analyzer import analyze_hotpath
from .utils.runtime_analyzer import analyze_runtime
from .utils.concurrency_analyzer import analyze_concurrency
from .utils.memory_analyzer import analyze_memory
from .utils.suitability_engine import get_recommendations, get_all_domain_rankings, LANGUAGE_DATABASE


@login_required
def dashboard(request):
    """Main dashboard view."""
    submissions = CodeSubmission.objects.filter(user=request.user)[:5]
    reports = AnalysisReport.objects.filter(user=request.user)[:10]
    total_submissions = CodeSubmission.objects.filter(user=request.user).count()
    total_reports = AnalysisReport.objects.filter(user=request.user).count()

    # Stats for cards
    analysis_types_count = {}
    for report in AnalysisReport.objects.filter(user=request.user):
        atype = report.get_analysis_type_display()
        analysis_types_count[atype] = analysis_types_count.get(atype, 0) + 1

    context = {
        'submissions': submissions,
        'reports': reports,
        'total_submissions': total_submissions,
        'total_reports': total_reports,
        'analysis_types_count': analysis_types_count,
    }
    return render(request, 'analyzer/dashboard.html', context)


@login_required
def code_input(request):
    """Code input and file upload view."""
    if request.method == 'POST':
        form = CodeInputForm(request.POST, request.FILES)
        if form.is_valid():
            submission = form.save(commit=False)
            submission.user = request.user

            # If file uploaded, read its content
            if submission.file_upload:
                try:
                    content = submission.file_upload.read().decode('utf-8')
                    if not submission.source_code:
                        submission.source_code = content
                except Exception:
                    messages.error(request, 'Could not read uploaded file.')
                    return render(request, 'analyzer/code_input.html', {'form': form})

            submission.save()
            messages.success(request, 'Code submitted successfully! Choose an analysis module.')
            return redirect('analysis_select', pk=submission.pk)
    else:
        form = CodeInputForm()
    return render(request, 'analyzer/code_input.html', {'form': form})


@login_required
def analysis_select(request, pk):
    """Select analysis type for a submission."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    code_output = capture_python_output(submission.source_code)
    return render(request, 'analyzer/analysis_select.html', {
        'submission': submission,
        'code_output': code_output,
    })


def capture_python_output(source_code):
    """Run submitted Python code and capture stdout/stderr for preview."""
    stdout = io.StringIO()
    stderr = io.StringIO()

    try:
        code_obj = compile(source_code, '<analysis_select_preview>', 'exec')
        namespace = {
            '__builtins__': __builtins__,
            '__name__': '__analysis_select_preview__',
        }

        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exec(code_obj, namespace, namespace)

    except Exception:
        stderr.write(traceback.format_exc(limit=3))

    stdout_value = stdout.getvalue()
    stderr_value = stderr.getvalue()

    return {
        'stdout': stdout_value[-5000:],
        'stderr': stderr_value[-5000:],
        'has_output': bool(stdout_value or stderr_value),
    }


@login_required
def bytecode_analysis(request, pk):
    """Bytecode compilation analysis."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    results = analyze_bytecode(submission.source_code)
    nested = get_nested_bytecode(submission.source_code)
    results['nested_functions'] = nested

    # Save report
    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='bytecode',
        results=results,
    )

    return render(request, 'analyzer/bytecode_analysis.html', {
        'submission': submission,
        'results': results,
        'report': report,
    })


@login_required
def caching_analysis(request, pk):
    """Inline caching analysis."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    results = simulate_inline_caching(submission.source_code)

    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='caching',
        results=results,
    )

    return render(request, 'analyzer/caching_analysis.html', {
        'submission': submission,
        'results': results,
        'report': report,
    })


@login_required
def optimization_analysis(request, pk):

    submission = get_object_or_404(
        CodeSubmission,
        pk=pk,
        user=request.user
    )

    results = analyze_optimizations(
        submission.source_code
    )

    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='optimization',
        results=results,
    )

    return render(
        request,
        'analyzer/optimization_analysis.html',
        {
            'submission': submission,
            'results': results,
            'report': report,
        }
    )


@login_required
def hotpath_analysis(request, pk):
    """Hot path detection and profiling."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    results = analyze_hotpath(submission.source_code)

    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='hotpath',
        results=results,
    )

    return render(request, 'analyzer/hotpath_analysis.html', {
        'submission': submission,
        'results': results,
        'report': report,
    })


@login_required
def runtime_analysis(request, pk):
    """Runtime efficiency analysis."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    results = analyze_runtime(submission.source_code)

    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='runtime',
        results=results,
    )

    return render(request, 'analyzer/runtime_analysis.html', {
        'submission': submission,
        'results': results,
        'report': report,
    })


@login_required
def concurrency_analysis(request, pk):
    """Concurrency and parallelism analysis."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    results = analyze_concurrency(submission.source_code)

    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='concurrency',
        results=results,
    )

    return render(request, 'analyzer/concurrency_analysis.html', {
        'submission': submission,
        'results': results,
        'report': report,
    })


@login_required
def memory_analysis(request, pk):
    """Memory overhead analysis."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    results = analyze_memory(submission.source_code)

    report = AnalysisReport.objects.create(
        submission=submission,
        user=request.user,
        analysis_type='memory',
        results=results,
    )

    return render(request, 'analyzer/memory_analysis.html', {
        'submission': submission,
        'results': results,
        'report': report,
    })


@login_required
def suitability_analysis(request):
    """Application suitability recommendation engine."""
    results = None
    form = SuitabilityForm()

    if request.method == 'POST':
        form = SuitabilityForm(request.POST)
        if form.is_valid():
            domain = form.cleaned_data['domain']
            weights = {
                'runtime_efficiency': form.cleaned_data['runtime_efficiency'] / 10.0,
                'memory_overhead': form.cleaned_data['memory_overhead'] / 10.0,
                'concurrency_support': form.cleaned_data['concurrency_support'] / 10.0,
                'scalability': form.cleaned_data['scalability'] / 10.0,
                'ecosystem_maturity': form.cleaned_data['ecosystem_maturity'] / 10.0,
                'development_speed': form.cleaned_data['development_speed'] / 10.0,
            }
            results = get_recommendations(domain=domain, weights=weights)

    domain_rankings = get_all_domain_rankings()

    return render(request, 'analyzer/suitability_analysis.html', {
        'form': form,
        'results': results,
        'domain_rankings': domain_rankings,
        'languages': LANGUAGE_DATABASE,
    })


@login_required
def submissions_list(request):
    """List all user submissions."""
    submissions = CodeSubmission.objects.filter(user=request.user)
    return render(request, 'analyzer/submissions_list.html', {'submissions': submissions})


@login_required
def reports_list(request):
    """List all user reports."""
    reports = AnalysisReport.objects.filter(user=request.user)
    return render(request, 'analyzer/reports_list.html', {'reports': reports})


@login_required
def report_detail(request, pk):
    """View a saved report."""
    report = get_object_or_404(AnalysisReport, pk=pk, user=request.user)
    return render(request, 'analyzer/report_detail.html', {'report': report})


@login_required
def delete_submission(request, pk):
    """Delete a submission."""
    submission = get_object_or_404(CodeSubmission, pk=pk, user=request.user)
    submission.delete()
    messages.success(request, 'Submission deleted.')
    return redirect('submissions_list')
