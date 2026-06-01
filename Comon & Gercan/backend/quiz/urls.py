from django.urls import path

from . import views

app_name = "quiz"

urlpatterns = [
    path("", views.home, name="home"),
    path("create-quiz/", views.create_quiz, name="create_quiz"),
    path("my-quizzes/", views.my_quizzes, name="my_quizzes"),
    path("question-bank/", views.question_bank, name="question_bank"),
    path("results/", views.results, name="results"),
    path("analytics/", views.analytics, name="analytics"),
    path("settings/", views.settings, name="settings"),
    path("generate/", views.generate, name="generate"),
    path("import-pdf/", views.import_pdf, name="import_pdf"),
    path("save-builder-quiz/", views.save_builder_quiz, name="save_builder_quiz"),
    path("quiz/<int:pk>/", views.detail, name="detail"),
    path("quiz/<int:pk>/json/", views.quiz_json, name="json"),
    path("quiz/<int:pk>/submit/", views.submit_attempt, name="submit_attempt"),
    path("quiz/<int:pk>/access/", views.update_quiz_access, name="update_quiz_access"),
]
