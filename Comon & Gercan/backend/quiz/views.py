import json

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import Group
from django.db.models import Q
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods

from .models import Quiz, QuizAttempt, UserProfile
from .services import (
    DIFFICULTY_NOTES,
    FEATURES,
    build_quiz,
    extract_pdf_text,
    feature_cards,
    generate_questions_from_text,
)


def home(request):
    if request.user.is_authenticated:
        dashboard = _dashboard_context(request)
        quizzes = dashboard["recent_quizzes"]
    else:
        dashboard = None
        quizzes = Quiz.objects.none()
    return render(
        request,
        "quiz/home.html",
        {
            "features": feature_cards(),
            "feature_map": FEATURES,
            "quizzes": quizzes,
            "dashboard": dashboard,
            "difficulty_notes": DIFFICULTY_NOTES,
        },
    )


@login_required
def create_quiz(request):
    if not _is_instructor(request.user):
        return HttpResponseForbidden("Only instructors can create quizzes.")
    return render(
        request,
        "quiz/create_quiz.html",
        {
            "features": feature_cards(),
            "feature_map": FEATURES,
            "difficulty_notes": DIFFICULTY_NOTES,
            "students": _student_users(),
            "groups": Group.objects.all().order_by("name"),
        },
    )


@login_required
def my_quizzes(request):
    if _is_instructor(request.user):
        quizzes = _visible_quizzes(request)
        attempts = QuizAttempt.objects.filter(quiz__in=quizzes).select_related("quiz", "user")
    else:
        quizzes = _visible_quizzes(request)
        attempts = QuizAttempt.objects.filter(user=request.user).select_related("quiz")
    return render(
        request,
        "quiz/my_quizzes.html",
        {
            "quizzes": quizzes,
            "attempts": attempts,
            "is_instructor": _is_instructor(request.user),
            "page_title": "My Quizzes" if not request.user.is_staff else "All Quizzes",
        },
    )


@login_required
def question_bank(request):
    questions = []
    for feature in feature_cards():
        for question in feature["questions"]:
            questions.append(
                {
                    "topic": feature["label"],
                    "prompt": question["prompt"],
                    "answer": question["choices"][question["answer"]],
                    "explanation": question["explanation"],
                }
            )

    return render(
        request,
        "quiz/question_bank.html",
        {
            "features": feature_cards(),
            "questions": questions,
        },
    )


@login_required
def results(request):
    attempts = QuizAttempt.objects.filter(user=request.user).select_related("quiz")
    return render(
        request,
        "quiz/results.html",
        {
            "quizzes": _visible_quizzes(request),
            "attempts": attempts,
        },
    )


@login_required
def analytics(request):
    if not _is_instructor(request.user):
        return HttpResponseForbidden("Only instructors can view quiz analytics.")
    quizzes = list(_visible_quizzes(request))
    total_questions = sum(len(quiz.questions) for quiz in quizzes)
    topic_counts = {feature["label"]: 0 for feature in feature_cards()}
    quiz_analytics = []

    for quiz in quizzes:
        for topic_key in quiz.topics:
            if topic_key in FEATURES:
                topic_counts[FEATURES[topic_key]["label"]] += 1
        attempts = list(quiz.attempts.select_related("user"))
        passed = sum(1 for attempt in attempts if attempt.passed)
        failed = len(attempts) - passed
        quiz_analytics.append(
            {
                "quiz": quiz,
                "total": len(attempts),
                "passed": passed,
                "failed": failed,
                "pass_rate": round((passed / len(attempts)) * 100) if attempts else 0,
                "attempts": attempts,
            }
        )

    return render(
        request,
        "quiz/analytics.html",
        {
            "quiz_count": len(quizzes),
            "total_questions": total_questions,
            "average_questions": round(total_questions / len(quizzes), 1) if quizzes else 0,
            "topic_counts": topic_counts,
            "quiz_analytics": quiz_analytics,
        },
    )


@login_required
def settings(request):
    return render(request, "quiz/settings.html")


@require_http_methods(["POST"])
@login_required
def generate(request):
    if not _is_instructor(request.user):
        return HttpResponseForbidden("Only instructors can create quizzes.")
    topics = request.POST.getlist("topics") or list(FEATURES)
    difficulty = request.POST.get("difficulty", "applied")
    count = request.POST.get("count", "8")
    title = request.POST.get("title", "").strip() or "Programming Languages Quiz"
    time_limit_seconds = _positive_int(request.POST.get("time_limit_seconds"), 5, 1, 300)
    pass_mark = _positive_int(request.POST.get("pass_mark"), 60, 1, 100)
    questions = build_quiz(topics, difficulty, count)

    quiz = Quiz.objects.create(
        title=title,
        owner=request.user,
        difficulty=difficulty,
        topics=topics,
        questions=questions,
        time_limit_seconds=time_limit_seconds,
        pass_mark=pass_mark,
    )
    _apply_assignments(quiz, request.POST)
    return redirect(quiz)


@require_http_methods(["POST"])
@login_required
def import_pdf(request):
    uploaded_file = request.FILES.get("pdf")
    try:
        count = int(request.POST.get("count", 8))
    except (TypeError, ValueError):
        count = 8

    if not uploaded_file:
        return JsonResponse({"error": "Upload a PDF file first."}, status=400)

    if uploaded_file.content_type != "application/pdf" and not uploaded_file.name.lower().endswith(".pdf"):
        return JsonResponse({"error": "Only PDF files are supported."}, status=400)

    if uploaded_file.size > 8 * 1024 * 1024:
        return JsonResponse({"error": "PDF must be 8 MB or smaller."}, status=400)

    try:
        text = extract_pdf_text(uploaded_file)
    except Exception:
        return JsonResponse({"error": "Could not read text from this PDF."}, status=400)

    if len(text.split()) < 40:
        return JsonResponse({"error": "The PDF does not contain enough extractable text."}, status=400)

    questions = generate_questions_from_text(text, count=max(3, min(count, 15)))
    if not questions:
        return JsonResponse({"error": "No usable questions could be generated from the PDF."}, status=400)

    return JsonResponse(
        {
            "title": uploaded_file.name.rsplit(".", 1)[0],
            "word_count": len(text.split()),
            "questions": questions,
        }
    )


@require_http_methods(["POST"])
@login_required
def save_builder_quiz(request):
    if not _is_instructor(request.user):
        return HttpResponseForbidden("Only instructors can create quizzes.")
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid quiz data."}, status=400)

    title = str(payload.get("title", "")).strip() or "Imported PDF Quiz"
    questions = payload.get("questions", [])
    cleaned_questions = clean_builder_questions(questions)

    if not cleaned_questions:
        return JsonResponse({"error": "Add at least one valid question before saving."}, status=400)

    quiz = Quiz.objects.create(
        title=title[:120],
        owner=request.user,
        difficulty="applied",
        topics=["imported_pdf"],
        questions=cleaned_questions,
        time_limit_seconds=_positive_int(payload.get("time_limit_seconds"), 5, 1, 300),
        pass_mark=_positive_int(payload.get("pass_mark"), 60, 1, 100),
    )
    return JsonResponse({"redirect_url": quiz.get_absolute_url(), "quiz_id": quiz.pk})


@login_required
def detail(request, pk):
    quiz = get_object_or_404(_visible_quizzes(request), pk=pk)
    latest_attempt = QuizAttempt.objects.filter(quiz=quiz, user=request.user).first()
    return render(
        request,
        "quiz/detail.html",
        {
            "quiz": quiz,
            "features": feature_cards(quiz.topics),
            "question_total": len(quiz.questions),
            "latest_attempt": latest_attempt,
            "is_instructor": _is_instructor(request.user),
            "students": _student_users(),
            "groups": Group.objects.all().order_by("name"),
        },
    )


@login_required
def quiz_json(request, pk):
    quiz = get_object_or_404(_visible_quizzes(request), pk=pk)
    return JsonResponse(
        {
            "id": quiz.pk,
            "title": quiz.title,
            "difficulty": quiz.difficulty,
            "topics": quiz.topics,
            "questions": quiz.questions,
        }
    )


@require_http_methods(["POST"])
@login_required
def submit_attempt(request, pk):
    quiz = get_object_or_404(_visible_quizzes(request), pk=pk)
    if _is_instructor(request.user):
        return HttpResponseForbidden("Instructor accounts cannot submit student attempts.")

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid attempt data."}, status=400)

    submitted_details = payload.get("details", [])
    details = _score_attempt_details(quiz, submitted_details)
    score = sum(1 for item in details if item.get("correct"))
    total_questions = len(quiz.questions)
    completion_time = _positive_int(payload.get("completion_time_seconds"), 0, 0, 86400)

    attempt = QuizAttempt.objects.create(
        quiz=quiz,
        user=request.user,
        score=score,
        total_questions=total_questions,
        completion_time_seconds=completion_time,
        details=details,
    )
    return JsonResponse(
        {
            "score": attempt.score,
            "total": attempt.total_questions,
            "percentage": attempt.percentage,
            "passed": attempt.passed,
            "completed_at": attempt.completed_at.isoformat(),
        }
    )


@require_http_methods(["POST"])
@login_required
def update_quiz_access(request, pk):
    quiz = get_object_or_404(Quiz, pk=pk)
    if not _can_manage_quiz(request.user, quiz):
        return HttpResponseForbidden("Only the quiz instructor can update access.")

    _apply_assignments(quiz, request.POST)
    messages.success(request, "Quiz access updated.")
    return redirect(quiz)


def _visible_quizzes(request):
    if request.user.is_staff:
        return Quiz.objects.all()
    if _is_instructor(request.user):
        return Quiz.objects.filter(owner=request.user)
    return (
        Quiz.objects.filter(
            Q(owner=request.user)
            | Q(assigned_users=request.user)
            | Q(assigned_groups__in=request.user.groups.all())
        )
        .distinct()
    )


def _can_manage_quiz(user, quiz):
    return user.is_staff or (_is_instructor(user) and quiz.owner_id == user.id)


def _is_instructor(user):
    if not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    profile = _profile_for(user)
    return profile.role == UserProfile.ROLE_INSTRUCTOR


def _profile_for(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def _student_users():
    User = get_user_model()
    instructor_ids = UserProfile.objects.filter(role=UserProfile.ROLE_INSTRUCTOR).values("user_id")
    return User.objects.exclude(id__in=instructor_ids).exclude(is_staff=True).order_by("username")


def _positive_int(value, default, minimum, maximum):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(number, maximum))


def _apply_assignments(quiz, data):
    quiz.assigned_users.set(data.getlist("assigned_users"))
    quiz.assigned_groups.set(data.getlist("assigned_groups"))


def _dashboard_context(request):
    if _is_instructor(request.user):
        return _instructor_dashboard_context(request)
    return _student_dashboard_context(request)


def _instructor_dashboard_context(request):
    quizzes = list(_visible_quizzes(request))
    attempts = list(
        QuizAttempt.objects.filter(quiz__in=quizzes)
        .select_related("quiz", "user")
        .order_by("-completed_at")
    )
    total_students = _student_users().count()
    passed = sum(1 for attempt in attempts if attempt.passed)
    failed = len(attempts) - passed
    average_score = _average_percentage(attempts)
    active_quizzes = sum(1 for quiz in quizzes if quiz.assigned_users.exists() or quiz.assigned_groups.exists())

    return {
        "role": "instructor",
        "stats": [
            {"label": "Total quizzes", "value": len(quizzes), "detail": "Created by you"},
            {"label": "Active quizzes", "value": active_quizzes, "detail": "Assigned to users or groups"},
            {"label": "Students", "value": total_students, "detail": "Available learner accounts"},
            {"label": "Quiz attempts", "value": len(attempts), "detail": "Submitted attempts"},
            {"label": "Average score", "value": f"{average_score}%", "detail": "Across all attempts"},
            {"label": "Pass rate", "value": f"{_rate(passed, len(attempts))}%", "detail": f"{passed} passed / {failed} failed"},
        ],
        "pass_fail": _pass_fail_chart(passed, failed),
        "score_bands": _score_bands(attempts),
        "most_attempted": _most_attempted_quizzes(quizzes, attempts),
        "participation": _participation_by_student(attempts),
        "recent_quizzes": quizzes[:5],
        "recent_attempts": attempts[:6],
        "quick_actions": [
            {"label": "Create Quiz", "url_name": "quiz:create_quiz", "style": "primary"},
            {"label": "View Results", "url_name": "quiz:results", "style": "secondary"},
            {"label": "Analytics", "url_name": "quiz:analytics", "style": "secondary"},
        ],
    }


def _student_dashboard_context(request):
    quizzes = list(_visible_quizzes(request))
    attempts = list(
        QuizAttempt.objects.filter(user=request.user)
        .select_related("quiz")
        .order_by("-completed_at")
    )
    completed_quiz_ids = {attempt.quiz_id for attempt in attempts}
    pending_quizzes = [quiz for quiz in quizzes if quiz.id not in completed_quiz_ids]
    passed = sum(1 for attempt in attempts if attempt.passed)
    failed = len(attempts) - passed
    average_score = _average_percentage(attempts)
    completion_rate = _rate(len(completed_quiz_ids), len(quizzes))

    return {
        "role": "student",
        "stats": [
            {"label": "Assigned quizzes", "value": len(quizzes), "detail": "Available to take"},
            {"label": "Completed quizzes", "value": len(completed_quiz_ids), "detail": "Finished at least once"},
            {"label": "Pending quizzes", "value": len(pending_quizzes), "detail": "Waiting for your attempt"},
            {"label": "Average score", "value": f"{average_score}%", "detail": "Across completed quizzes"},
            {"label": "Pass rate", "value": f"{_rate(passed, len(attempts))}%", "detail": f"{passed} passed / {failed} failed"},
            {"label": "Learning progress", "value": f"{completion_rate}%", "detail": "Assigned quizzes completed"},
        ],
        "pass_fail": _pass_fail_chart(passed, failed),
        "score_bands": _score_bands(attempts),
        "recent_quizzes": quizzes[:5],
        "pending_quizzes": pending_quizzes[:5],
        "recent_attempts": attempts[:6],
        "quick_actions": [
            {"label": "My Quizzes", "url_name": "quiz:my_quizzes", "style": "primary"},
            {"label": "View Results", "url_name": "quiz:results", "style": "secondary"},
            {"label": "Question Bank", "url_name": "quiz:question_bank", "style": "secondary"},
        ],
    }


def _average_percentage(attempts):
    if not attempts:
        return 0
    return round(sum(attempt.percentage for attempt in attempts) / len(attempts))


def _rate(part, whole):
    if not whole:
        return 0
    return round((part / whole) * 100)


def _pass_fail_chart(passed, failed):
    total = passed + failed
    return {
        "passed": passed,
        "failed": failed,
        "passed_rate": _rate(passed, total),
        "failed_rate": _rate(failed, total),
    }


def _score_bands(attempts):
    bands = [
        {"label": "90-100", "count": 0},
        {"label": "75-89", "count": 0},
        {"label": "60-74", "count": 0},
        {"label": "0-59", "count": 0},
    ]
    for attempt in attempts:
        percentage = attempt.percentage
        if percentage >= 90:
            bands[0]["count"] += 1
        elif percentage >= 75:
            bands[1]["count"] += 1
        elif percentage >= 60:
            bands[2]["count"] += 1
        else:
            bands[3]["count"] += 1
    maximum = max([band["count"] for band in bands] + [1])
    for band in bands:
        band["width"] = _rate(band["count"], maximum)
    return bands


def _most_attempted_quizzes(quizzes, attempts):
    counts = {quiz.id: {"quiz": quiz, "count": 0} for quiz in quizzes}
    for attempt in attempts:
        if attempt.quiz_id in counts:
            counts[attempt.quiz_id]["count"] += 1
    rows = sorted(counts.values(), key=lambda item: item["count"], reverse=True)[:5]
    maximum = max([row["count"] for row in rows] + [1])
    for row in rows:
        row["width"] = _rate(row["count"], maximum)
    return rows


def _participation_by_student(attempts):
    rows = {}
    for attempt in attempts:
        rows.setdefault(attempt.user_id, {"name": attempt.user.username, "count": 0})
        rows[attempt.user_id]["count"] += 1
    ordered = sorted(rows.values(), key=lambda item: item["count"], reverse=True)[:5]
    maximum = max([row["count"] for row in ordered] + [1])
    for row in ordered:
        row["width"] = _rate(row["count"], maximum)
    return ordered


def _score_attempt_details(quiz, submitted_details):
    submitted_by_index = {
        int(item.get("question_index")): item
        for item in submitted_details
        if str(item.get("question_index", "")).isdigit()
    }
    scored = []
    for index, question in enumerate(quiz.questions):
        submitted = submitted_by_index.get(index, {})
        selected = submitted.get("selected_answer")
        selected_label = _answer_label(question, selected)
        correct_label = _answer_label(question, question.get("answer"))
        correct = _is_answer_correct(question, selected)
        scored.append(
            {
                "question_index": index,
                "prompt": question.get("prompt", ""),
                "selected_answer": selected,
                "selected_label": selected_label,
                "correct_answer": question.get("answer"),
                "correct_label": correct_label,
                "correct": correct,
                "time_limit_seconds": quiz.time_limit_seconds,
                "timed_out": bool(submitted.get("timed_out")),
            }
        )
    return scored


def _answer_label(question, value):
    if value is None or value == "":
        return ""
    if (question.get("type") or "mcq") == "short_answer":
        return str(value)
    choices = question.get("choices") or []
    try:
        return choices[int(value)]
    except (TypeError, ValueError, IndexError):
        return ""


def _is_answer_correct(question, selected):
    if selected is None or selected == "":
        return False
    if (question.get("type") or "mcq") == "short_answer":
        return _normalize_answer(question.get("answer")) in _normalize_answer(selected)
    try:
        return int(selected) == int(question.get("answer"))
    except (TypeError, ValueError):
        return False


def _normalize_answer(value):
    return str(value or "").strip().lower()


def clean_builder_questions(questions):
    cleaned = []
    for item in questions:
        question_type = item.get("type", "mcq")
        prompt = str(item.get("prompt", "")).strip()
        explanation = str(item.get("explanation", "")).strip()

        if question_type not in {"mcq", "true_false", "short_answer"} or not prompt:
            continue

        if question_type == "mcq":
            choices = [str(choice).strip() for choice in item.get("choices", []) if str(choice).strip()]
            if len(choices) < 2:
                continue
            try:
                answer = int(item.get("answer", 0))
            except (TypeError, ValueError):
                answer = 0
            answer = max(0, min(answer, len(choices) - 1))
        elif question_type == "true_false":
            choices = ["True", "False"]
            answer = 0 if str(item.get("answer", "0")) in {"0", "True", "true"} else 1
        else:
            choices = []
            answer = str(item.get("answer", "")).strip()
            if not answer:
                continue

        cleaned.append(
            {
                "type": question_type,
                "topic": "Imported PDF",
                "topic_key": "imported_pdf",
                "difficulty": "applied",
                "prompt": prompt,
                "choices": choices,
                "answer": answer,
                "explanation": explanation,
            }
        )
    return cleaned
