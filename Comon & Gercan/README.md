# PRAXIS - Programming Languages Quiz System

PRAXIS is a Django web application for creating, assigning, taking, and tracking programming languages quizzes. The system focuses on topics such as concurrency and parallelism, duck typing, memory overhead, and dangling pointers. It supports instructor-created quizzes, PDF-based quiz drafting, student attempts, score tracking, and analytics dashboards.

## System Overview

The project is organized as a single Django application with a separated folder layout for backend code and frontend assets:

```text
pl-project/
├── backend/
│   ├── manage.py
│   ├── db.sqlite3
│   ├── plquiz/
│   │   ├── settings.py
│   │   └── urls.py
│   └── quiz/
│       ├── models.py
│       ├── views.py
│       ├── urls.py
│       ├── services.py
│       ├── forms.py
│       └── tests.py
├── frontend/
│   ├── templates/
│   │   ├── account/
│   │   └── quiz/
│   └── static/
│       └── quiz/
│           ├── app.css
│           ├── builder.js
│           └── quiz.js
└── README.md
```

Although the folders are named `backend` and `frontend`, this is not a separate API server plus SPA setup. Django serves the HTML templates, static CSS, and JavaScript. JavaScript is used where the interface needs live behavior, such as the quiz player and PDF quiz builder.

## Frontend

The frontend lives in `frontend/templates` and `frontend/static`.

### Templates

The main template layout is `frontend/templates/quiz/base.html`. It provides:

- The shared page shell.
- Tailwind CSS and Flowbite CDN links.
- The PRAXIS navigation bar.
- Authenticated sidebar navigation.
- Message rendering.
- Static CSS loading from `quiz/app.css`.

The main user-facing pages are:

- `home.html` - public landing page and authenticated dashboard.
- `create_quiz.html` - instructor quiz creation page.
- `detail.html` - interactive quiz-taking page.
- `my_quizzes.html` - quiz library and attempt details.
- `results.html` - saved attempt results.
- `analytics.html` - instructor analytics.
- `question_bank.html` - built-in topic and question reference.
- `settings.html` - settings page.

Authentication templates are stored in `frontend/templates/account` and are used by `django-allauth` for login, logout, and signup.

### Styling

Most styling is done with Tailwind utility classes directly in the templates. `frontend/static/quiz/app.css` adds small custom styles for:

- Smooth scrolling.
- Correct and incorrect quiz choice states.
- Animated landing-page heading characters.

### JavaScript

The frontend JavaScript is intentionally small and page-specific.

`frontend/static/quiz/quiz.js` powers the quiz-taking experience:

- Reads quiz question data from Django's `json_script` output in `detail.html`.
- Shows one question at a time.
- Tracks selected answers.
- Enforces the per-question timer.
- Locks questions after time expires or the user moves forward.
- Calculates local score and accuracy.
- Sends final attempt data to the backend with `fetch`.

`frontend/static/quiz/builder.js` powers the PDF import and editable quiz builder:

- Switches between manual generation and PDF import tabs.
- Uploads a PDF to the backend.
- Receives generated draft questions as JSON.
- Lets instructors edit prompts, choices, answers, and explanations.
- Saves the final builder quiz through a JSON POST request.

## Backend

The backend is a Django 5.1 project located in `backend`.

### Project Configuration

`backend/plquiz/settings.py` configures:

- Django apps and middleware.
- SQLite database storage in `backend/db.sqlite3`.
- Template loading from `frontend/templates`.
- Static file loading from `frontend/static`.
- `django-allauth` authentication.
- Google OAuth provider support.
- Login, logout, and signup behavior.

`backend/plquiz/urls.py` connects the top-level routes:

- `/` -> quiz application routes.
- `/accounts/` -> django-allauth routes.
- `/admin/` -> Django admin.

### Quiz App Routes

`backend/quiz/urls.py` maps the application URLs:

- `/` - dashboard or public home page.
- `/create-quiz/` - quiz creation interface.
- `/my-quizzes/` - visible quizzes and attempts.
- `/question-bank/` - built-in question bank.
- `/results/` - current user's results.
- `/analytics/` - instructor analytics.
- `/settings/` - settings page.
- `/generate/` - create a quiz from built-in topics.
- `/import-pdf/` - extract text and draft questions from a PDF.
- `/save-builder-quiz/` - save edited builder questions.
- `/quiz/<id>/` - quiz detail and player.
- `/quiz/<id>/json/` - export quiz data as JSON.
- `/quiz/<id>/submit/` - submit a student attempt.
- `/quiz/<id>/access/` - update student/group quiz access.

### Data Models

The main models are in `backend/quiz/models.py`.

`UserProfile` extends Django users with a role:

- `student`
- `instructor`

`Quiz` stores quiz metadata and content:

- Title.
- Owner.
- Difficulty.
- Topic keys.
- Question data as JSON.
- Time limit per question.
- Pass mark.
- Assigned users.
- Assigned groups.
- Creation timestamp.

`QuizAttempt` stores a completed student attempt:

- Quiz.
- User.
- Score.
- Total questions.
- Completion time.
- Per-question details.
- Completion timestamp.

It also exposes helper properties for percentage score and pass/fail status.

### Services

`backend/quiz/services.py` contains most of the quiz-generation logic:

- Built-in programming language feature definitions.
- Built-in seed questions.
- Difficulty notes.
- Manual quiz generation with `build_quiz`.
- Feature card formatting with `feature_cards`.
- PDF text extraction with `pypdf`.
- Simple PDF-to-question generation.
- Keyword extraction and answer phrase selection.

The PDF generator creates three kinds of draft questions:

- Multiple choice.
- True/false.
- Short answer.

These questions are editable before being saved.

### Views and Permissions

`backend/quiz/views.py` handles page rendering, JSON endpoints, permissions, scoring, and dashboards.

Important permission rules:

- Only authenticated users can access most quiz pages.
- Only instructors and staff can create quizzes.
- Only instructors and staff can view analytics.
- Students can only see quizzes assigned to them, assigned to their groups, or owned by them.
- Instructors can manage only their own quizzes unless they are staff.
- Instructor accounts can preview quizzes but cannot submit student attempts.

The view layer also builds separate dashboards:

- Instructor dashboard: total quizzes, active quizzes, students, attempts, average score, pass rate, score distribution, participation, and recent activity.
- Student dashboard: assigned quizzes, completed quizzes, pending quizzes, average score, pass rate, learning progress, and recent attempts.

## Request Flow

### Manual Quiz Creation

1. An instructor opens `/create-quiz/`.
2. Django renders `create_quiz.html` with available topics, students, and groups.
3. The instructor selects topics, difficulty, question count, time limit, pass mark, and assignments.
4. The form posts to `/generate/`.
5. `views.generate` validates the user role and form values.
6. `services.build_quiz` creates question data from the built-in topic bank.
7. A `Quiz` record is saved to SQLite.
8. Selected students and groups are attached.
9. The instructor is redirected to `/quiz/<id>/`.

### PDF Quiz Creation

1. An instructor opens `/create-quiz/` and selects the Import PDF tab.
2. `builder.js` uploads the PDF to `/import-pdf/`.
3. `views.import_pdf` validates file type, size, and text quality.
4. `services.extract_pdf_text` reads the PDF using `pypdf`.
5. `services.generate_questions_from_text` turns extracted sentences into draft questions.
6. The backend returns JSON containing the title, word count, and questions.
7. `builder.js` renders editable question cards.
8. The instructor edits the questions and clicks Save / Publish Quiz.
9. `builder.js` posts JSON to `/save-builder-quiz/`.
10. `views.save_builder_quiz` cleans and validates the builder questions.
11. A new `Quiz` is saved and the frontend redirects to the quiz detail page.

### Taking a Quiz

1. A student opens an assigned quiz at `/quiz/<id>/`.
2. Django checks visibility with `_visible_quizzes`.
3. `detail.html` embeds the quiz questions and time limit safely as JSON.
4. `quiz.js` renders the interactive quiz player.
5. The student answers each question before the timer expires.
6. When finished, `quiz.js` posts attempt details to `/quiz/<id>/submit/`.
7. `views.submit_attempt` scores the attempt server-side.
8. A `QuizAttempt` record is saved.
9. The response returns score, total, percentage, and pass/fail status.
10. Results become visible in dashboards, results pages, and analytics.

### Analytics

1. An instructor opens `/analytics/`.
2. The backend loads quizzes visible to that instructor.
3. Attempts are grouped by quiz.
4. The page displays quiz counts, total questions, topic usage, pass/fail counts, pass rate, and student attempt rows.

## Authentication and Roles

Authentication is handled by Django's built-in auth system plus `django-allauth`.

Signup uses `CustomSignupForm` in `backend/quiz/forms.py`, which adds a role field. When a user registers, the system creates or updates a matching `UserProfile`.

Supported roles:

- Student: takes assigned quizzes and reviews personal results.
- Instructor: creates quizzes, assigns access, and views analytics.
- Staff/admin: can access Django admin and see all quizzes.

Google login/signup is available when a Google `SocialApp` with a client ID and secret has been configured in Django admin.

## Database

The system currently uses SQLite:

```text
backend/db.sqlite3
```

Migrations are stored in:

```text
backend/quiz/migrations/
```

The database stores users, profiles, quizzes, quiz attempts, assignments, groups, sessions, and allauth records.

## Setup

From the repository root:

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

If you already have the included `venv` set up, activate it instead:

```bash
source venv/bin/activate
```

Then run migrations from the backend directory:

```bash
cd backend
python manage.py migrate
```

## Running the App

Start the Django development server:

```bash
cd backend
python manage.py runserver
```

Open:

```text
http://127.0.0.1:8000/
```

## Running Tests

Run the Django test suite from the backend directory:

```bash
cd backend
python manage.py test
```

The tests cover quiz generation, role-protected creation, dashboard rendering, PDF builder saving, assigned-student quiz access, attempt submission, and instructor access management.

## Key Features

- Server-rendered Django pages.
- Tailwind and Flowbite based interface.
- Role-based student and instructor workflows.
- Built-in programming languages quiz bank.
- Manual quiz generation.
- PDF import with editable generated questions.
- Multiple choice, true/false, and short-answer support.
- Per-question timer.
- Server-side scoring.
- Pass/fail calculation.
- Quiz assignment by user or group.
- Student results history.
- Instructor analytics dashboard.
- JSON quiz export.
- Google OAuth readiness check.

## Notes for Future Development

- Move secrets such as `SECRET_KEY` into environment variables before production deployment.
- Set `DEBUG = False` and configure `ALLOWED_HOSTS` for production.
- Use PostgreSQL or another production database if the app needs concurrent users or deployment beyond local development.
- Add collected static file handling for production.
- Consider replacing the simple rule-based PDF question generator with an AI or NLP-backed generator if higher-quality imported quizzes are needed.
