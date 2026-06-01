import json

from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model

from .models import Quiz, QuizAttempt, UserProfile
from .services import build_quiz


class QuizGeneratorTests(TestCase):
    def test_build_quiz_uses_selected_topics_and_count(self):
        questions = build_quiz(["duck_typing", "dangling_pointers"], "applied", 4)

        self.assertEqual(len(questions), 4)
        self.assertEqual(
            {question["topic_key"] for question in questions},
            {"duck_typing", "dangling_pointers"},
        )

    def test_generate_view_creates_quiz(self):
        user = get_user_model().objects.create_user(
            username="teacher", email="teacher@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=user, role=UserProfile.ROLE_INSTRUCTOR)
        get_user_model().objects.create_user(
            username="student", email="student@example.com", password="pass12345"
        )
        self.client.force_login(user)

        response = self.client.post(
            reverse("quiz:generate"),
            {
                "title": "Memory Safety Quiz",
                "difficulty": "advanced",
                "count": "3",
                "topics": ["memory_overhead", "dangling_pointers"],
            },
        )

        quiz = Quiz.objects.get()
        self.assertRedirects(response, quiz.get_absolute_url())
        self.assertEqual(quiz.title, "Memory Safety Quiz")
        self.assertEqual(quiz.owner, user)
        self.assertEqual(len(quiz.questions), 3)

    def test_detail_and_json_pages_render(self):
        user = get_user_model().objects.create_user(
            username="student", email="student@example.com", password="pass12345"
        )
        self.client.force_login(user)
        quiz = Quiz.objects.create(
            title="Concurrency Quiz",
            owner=user,
            difficulty="fundamentals",
            topics=["concurrency"],
            questions=build_quiz(["concurrency"], "fundamentals", 2),
        )

        detail = self.client.get(quiz.get_absolute_url())
        exported = self.client.get(reverse("quiz:json", kwargs={"pk": quiz.pk}))

        self.assertContains(detail, "Concurrency Quiz")
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(exported.json()["title"], "Concurrency Quiz")

    def test_generate_requires_login(self):
        response = self.client.post(reverse("quiz:generate"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/accounts/login/", response["Location"])

    def test_authenticated_home_renders_system_dashboard(self):
        user = get_user_model().objects.create_user(
            username="teacher", email="teacher@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=user, role=UserProfile.ROLE_INSTRUCTOR)
        self.client.force_login(user)

        response = self.client.get(reverse("quiz:home"))

        self.assertContains(response, "System dashboard")
        self.assertContains(response, "Score Distribution")
        self.assertContains(response, "Recent Activity")
        self.assertNotContains(response, "Programming Languages Project")

    def test_create_quiz_page_renders_for_logged_in_user(self):
        user = get_user_model().objects.create_user(
            username="teacher", email="teacher@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=user, role=UserProfile.ROLE_INSTRUCTOR)
        get_user_model().objects.create_user(
            username="student", email="student@example.com", password="pass12345"
        )
        self.client.force_login(user)

        response = self.client.get(reverse("quiz:create_quiz"))

        self.assertContains(response, "Import PDF")
        self.assertContains(response, "Editable quiz builder")
        self.assertContains(response, "Student access")
        self.assertContains(response, "Can take")

    def test_save_builder_quiz_creates_published_quiz(self):
        user = get_user_model().objects.create_user(
            username="teacher", email="teacher@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=user, role=UserProfile.ROLE_INSTRUCTOR)
        self.client.force_login(user)
        payload = {
            "title": "Imported Concepts",
            "questions": [
                {
                    "type": "short_answer",
                    "prompt": "What concept prevents invalid references?",
                    "answer": "Borrow checking",
                    "explanation": "The answer should mention borrow checking.",
                },
                {
                    "type": "true_false",
                    "prompt": "True or False: Threads can add coordination overhead.",
                    "answer": 0,
                    "explanation": "Synchronization can add overhead.",
                },
            ],
        }

        response = self.client.post(
            reverse("quiz:save_builder_quiz"),
            data=json.dumps(payload),
            content_type="application/json",
        )

        quiz = Quiz.objects.get(title="Imported Concepts")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quiz_id"], quiz.pk)
        self.assertEqual(quiz.owner, user)
        self.assertEqual(len(quiz.questions), 2)

    def test_assigned_student_can_view_and_submit_attempt(self):
        teacher = get_user_model().objects.create_user(
            username="teacher", email="teacher@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=teacher, role=UserProfile.ROLE_INSTRUCTOR)
        student = get_user_model().objects.create_user(
            username="student", email="student@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=student, role=UserProfile.ROLE_STUDENT)
        quiz = Quiz.objects.create(
            title="Assigned Quiz",
            owner=teacher,
            difficulty="fundamentals",
            topics=["concurrency"],
            questions=build_quiz(["concurrency"], "fundamentals", 1),
        )
        quiz.assigned_users.add(student)
        question = quiz.questions[0]

        self.client.force_login(student)
        detail = self.client.get(quiz.get_absolute_url())
        response = self.client.post(
            reverse("quiz:submit_attempt", kwargs={"pk": quiz.pk}),
            data=json.dumps(
                {
                    "completion_time_seconds": 5,
                    "details": [
                        {
                            "question_index": 0,
                            "prompt": question["prompt"],
                            "selected_answer": question["answer"],
                            "correct": True,
                        }
                    ],
                }
            ),
            content_type="application/json",
        )

        self.assertContains(detail, "Assigned Quiz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(QuizAttempt.objects.get().score, 1)

    def test_instructor_can_manage_quiz_access_from_detail(self):
        teacher = get_user_model().objects.create_user(
            username="teacher", email="teacher@example.com", password="pass12345"
        )
        UserProfile.objects.create(user=teacher, role=UserProfile.ROLE_INSTRUCTOR)
        student = get_user_model().objects.create_user(
            username="student", email="student@example.com", password="pass12345"
        )
        quiz = Quiz.objects.create(
            title="Access Managed Quiz",
            owner=teacher,
            difficulty="fundamentals",
            topics=["concurrency"],
            questions=build_quiz(["concurrency"], "fundamentals", 1),
        )

        self.client.force_login(teacher)
        detail = self.client.get(quiz.get_absolute_url())
        response = self.client.post(
            reverse("quiz:update_quiz_access", kwargs={"pk": quiz.pk}),
            {"assigned_users": [str(student.pk)]},
        )

        self.assertContains(detail, "Quiz access")
        self.assertRedirects(response, quiz.get_absolute_url())
        self.assertIn(student, quiz.assigned_users.all())

# Create your tests here.
