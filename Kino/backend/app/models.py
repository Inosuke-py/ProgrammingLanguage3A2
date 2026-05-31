from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Text, Sequence
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


# Sequence used to generate sequential numeric IDs for users (1, 2, 3, ...)
# Independent of the UUID primary key, only used for shareable profile URLs.
user_number_seq = Sequence("user_number_seq", start=1, increment=1)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_number = Column(
        Integer,
        user_number_seq,
        server_default=user_number_seq.next_value(),
        unique=True,
        nullable=True,
        index=True,
    )
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=True, index=True)
    picture = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=False)
    role = Column(String, default="user")  # "user" or "admin"
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    streak = Column(Integer, default=0)
    last_active_date = Column(DateTime(timezone=True), nullable=True)
    last_active_at = Column(DateTime(timezone=True), nullable=True)  # presence heartbeat (online/idle/offline)
    longest_survival = Column(Integer, default=0)
    total_questions_answered = Column(Integer, default=0)
    pinned_badge_key = Column(String, nullable=True)  # User's showcased badge
    equipped_title_key = Column(String, nullable=True)  # Equipped title (e.g., "perfectionist")
    motto = Column(String, nullable=True)  # Custom user motto / status
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    materials = relationship("Material", back_populates="user")
    quizzes = relationship("Quiz", back_populates="user")
    attempts = relationship("Attempt", back_populates="user")
    badges = relationship("UserBadge", back_populates="user")


class Material(Base):
    __tablename__ = "materials"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, default="pdf")
    page_count = Column(Integer, nullable=True)
    processed = Column(Boolean, default=False)
    last_read_page = Column(Integer, default=1)
    is_public = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    topic = Column(String, nullable=True)
    field = Column(String, nullable=True)
    challenge_category = Column(String, nullable=True)  # "standard", "survival", "timed", "accuracy", "boss"
    is_featured = Column(Boolean, default=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)  # timed publishing: becomes visible at this time
    expires_at = Column(DateTime(timezone=True), nullable=True)  # timed publishing: hidden after this time
    share_token = Column(String, nullable=True, unique=True, index=True)
    share_permission = Column(String, default="view")  # "view" or "quiz"
    share_expires_at = Column(DateTime(timezone=True), nullable=True)  # share link expiry; null = old links from before this column existed (treated as expired going forward by router default)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="materials")
    sections = relationship("Section", back_populates="material", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="material", cascade="all, delete-orphan")


class Section(Base):
    __tablename__ = "sections"

    id = Column(String, primary_key=True, default=generate_uuid)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("Material", back_populates="sections")
    questions = relationship("Question", back_populates="section")


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(String, primary_key=True, default=generate_uuid)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    question_count = Column(Integer, nullable=False)
    config = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("Material", back_populates="quizzes")
    user = relationship("User", back_populates="quizzes")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    attempts = relationship("Attempt", back_populates="quiz")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=generate_uuid)
    quiz_id = Column(String, ForeignKey("quizzes.id"), nullable=False)
    section_id = Column(String, ForeignKey("sections.id"), nullable=True)
    type = Column(String, nullable=False)  # "mcq" or "true_false"
    content = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # list of option strings
    correct_answer = Column(String, nullable=False)
    explanation = Column(Text, nullable=True)
    source_text = Column(Text, nullable=True)  # the paragraph the question was generated from
    order_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    quiz = relationship("Quiz", back_populates="questions")
    section = relationship("Section", back_populates="questions")
    answers = relationship("Answer", back_populates="question")


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(String, primary_key=True, default=generate_uuid)
    quiz_id = Column(String, ForeignKey("quizzes.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    score = Column(Float, nullable=True)
    total_questions = Column(Integer, nullable=False)
    correct_count = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    quiz = relationship("Quiz", back_populates="attempts")
    user = relationship("User", back_populates="attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(String, primary_key=True, default=generate_uuid)
    attempt_id = Column(String, ForeignKey("attempts.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    user_answer = Column(String, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    confidence = Column(String, nullable=True)  # "guessing", "somewhat", "very_sure"
    time_taken = Column(Float, nullable=True)  # seconds
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attempt = relationship("Attempt", back_populates="answers")
    question = relationship("Question", back_populates="answers")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    page_number = Column(Integer, nullable=False)
    type = Column(String, nullable=False)  # "highlight" or "note"
    content = Column(Text, nullable=True)  # note text
    selected_text = Column(Text, nullable=True)  # highlighted text
    position = Column(JSON, nullable=True)  # {x, y, width, height} or text range
    color = Column(String, default="brand")  # highlight color key
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    material = relationship("Material")


class QuestionPool(Base):
    __tablename__ = "question_pool"

    id = Column(String, primary_key=True, default=generate_uuid)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    section_id = Column(String, ForeignKey("sections.id"), nullable=True)
    type = Column(String, nullable=False)  # "mcq" or "true_false"
    difficulty = Column(String, default="medium")  # "easy", "medium", "hard"
    content = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    correct_answer = Column(String, nullable=False)
    explanation = Column(Text, nullable=True)
    source_text = Column(Text, nullable=True)
    times_used = Column(Integer, default=0)
    quality_score = Column(Integer, nullable=True)  # 0-100, auto-assessed
    flagged = Column(Boolean, default=False)  # flagged for review
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("Material")
    section = relationship("Section")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    front = Column(Text, nullable=False)  # question
    back = Column(Text, nullable=False)  # answer
    difficulty = Column(String, default="medium")
    interval_days = Column(Integer, default=1)  # spaced repetition interval
    ease_factor = Column(Float, default=2.5)
    next_review = Column(DateTime(timezone=True), server_default=func.now())
    review_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    material = relationship("Material")


class Badge(Base):
    __tablename__ = "badges"

    id = Column(String, primary_key=True, default=generate_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    category = Column(String, default="study")  # study, accuracy, streaks, speed, survival, social, secret
    rarity = Column(String, default="common")  # common, rare, epic, legendary, mythic
    target_value = Column(Integer, nullable=True)  # e.g. 100 for "answer 100 questions"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserBadge(Base):
    __tablename__ = "user_badges"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    badge_key = Column(String, ForeignKey("badges.key"), nullable=False)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="badges")
    badge = relationship("Badge")


class AdaptiveSession(Base):
    """Tracks per-question state for adaptive and survival quiz modes."""
    __tablename__ = "adaptive_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    quiz_id = Column(String, ForeignKey("quizzes.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    current_index = Column(Integer, default=0)
    consecutive_correct = Column(Integer, default=0)
    consecutive_wrong = Column(Integer, default=0)
    current_difficulty = Column(String, default="medium")  # adaptive mode tracking
    is_active = Column(Boolean, default=True)  # survival mode: becomes False when hearts hit 0
    survival_count = Column(Integer, default=0)  # how many correct before game over
    hearts_remaining = Column(Integer, default=3)  # survival mode: 3 hearts, lose one per wrong answer
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    quiz = relationship("Quiz")
    user = relationship("User")


class SurvivalAttempt(Base):
    """One row per survival run a user starts. Used for the 3-per-day limit
    and for the survival leaderboard. Multiple rows = multiple runs that day.
    """
    __tablename__ = "survival_attempts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False, index=True)
    quiz_id = Column(String, ForeignKey("quizzes.id"), nullable=True)
    difficulty = Column(String, default="mixed")
    questions_survived = Column(Integer, default=0)
    status = Column(String, default="active")  # "active", "completed", "abandoned"
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    material = relationship("Material")
    quiz = relationship("Quiz")


# ===== Phase 5: Social & Collaboration =====


class SharedMaterial(Base):
    __tablename__ = "shared_materials"

    id = Column(String, primary_key=True, default=generate_uuid)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    shared_with_email = Column(String, nullable=False)
    shared_with_id = Column(String, ForeignKey("users.id"), nullable=True)
    permission = Column(String, default="view")  # "view" or "quiz"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("Material")
    owner = relationship("User", foreign_keys=[owner_id])
    shared_with = relationship("User", foreign_keys=[shared_with_id])


class Battle(Base):
    __tablename__ = "battles"

    id = Column(String, primary_key=True, default=generate_uuid)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    quiz_id = Column(String, ForeignKey("quizzes.id"), nullable=False)
    host_id = Column(String, ForeignKey("users.id"), nullable=False)
    opponent_id = Column(String, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="waiting")  # "waiting", "active", "completed"
    host_score = Column(Integer, default=0)
    opponent_score = Column(Integer, default=0)
    host_answers = Column(JSON, default=list)
    opponent_answers = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    material = relationship("Material")
    quiz = relationship("Quiz")
    host = relationship("User", foreign_keys=[host_id])
    opponent = relationship("User", foreign_keys=[opponent_id])


class StudyRoom(Base):
    __tablename__ = "study_rooms"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    material_id = Column(String, ForeignKey("materials.id"), nullable=True)
    host_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="active")  # "active" or "closed"
    participants = Column(JSON, default=list)  # list of user IDs
    max_participants = Column(Integer, default=10)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("Material")
    host = relationship("User")


class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(String, primary_key=True, default=generate_uuid)
    teacher_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    join_code = Column(String, unique=True, nullable=False, index=True)
    invite_link_token = Column(String, unique=True, nullable=True, index=True)
    is_public = Column(Boolean, default=False)
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("User")
    students = relationship("ClassroomStudent", back_populates="classroom", cascade="all, delete-orphan")
    assignments = relationship("ClassroomAssignment", back_populates="classroom", cascade="all, delete-orphan")
    quizzes = relationship("ClassroomQuiz", back_populates="classroom", cascade="all, delete-orphan")


class ClassroomStudent(Base):
    __tablename__ = "classroom_students"

    id = Column(String, primary_key=True, default=generate_uuid)
    classroom_id = Column(String, ForeignKey("classrooms.id"), nullable=False)
    student_id = Column(String, ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    classroom = relationship("Classroom", back_populates="students")
    student = relationship("User")


class ClassroomAssignment(Base):
    __tablename__ = "classroom_assignments"

    id = Column(String, primary_key=True, default=generate_uuid)
    classroom_id = Column(String, ForeignKey("classrooms.id"), nullable=False)
    material_id = Column(String, ForeignKey("materials.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    classroom = relationship("Classroom", back_populates="assignments")
    material = relationship("Material")


class ClassroomQuiz(Base):
    __tablename__ = "classroom_quizzes"

    id = Column(String, primary_key=True, default=generate_uuid)
    classroom_id = Column(String, ForeignKey("classrooms.id"), nullable=False)
    quiz_id = Column(String, ForeignKey("quizzes.id"), nullable=False)
    title = Column(String, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    config = Column(JSON, default=dict)  # {question_count, difficulty, types, time_pressure, time_per_question}
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_published = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    classroom = relationship("Classroom", back_populates="quizzes")
    quiz = relationship("Quiz")
    creator = relationship("User")
    attempts = relationship("ClassroomQuizAttempt", back_populates="classroom_quiz", cascade="all, delete-orphan")


class ClassroomQuizAttempt(Base):
    __tablename__ = "classroom_quiz_attempts"

    id = Column(String, primary_key=True, default=generate_uuid)
    classroom_quiz_id = Column(String, ForeignKey("classroom_quizzes.id"), nullable=False)
    student_id = Column(String, ForeignKey("users.id"), nullable=False)
    attempt_id = Column(String, ForeignKey("attempts.id"), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    classroom_quiz = relationship("ClassroomQuiz", back_populates="attempts")
    student = relationship("User")
    attempt = relationship("Attempt")

# ===== Classroom Phase 2: Announcements, Levels, Activity =====


class ClassroomAnnouncement(Base):
    __tablename__ = "classroom_announcements"

    id = Column(String, primary_key=True, default=generate_uuid)
    classroom_id = Column(String, ForeignKey("classrooms.id"), nullable=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    classroom = relationship("Classroom")
    author = relationship("User")


class ClassroomActivity(Base):
    __tablename__ = "classroom_activities"

    id = Column(String, primary_key=True, default=generate_uuid)
    classroom_id = Column(String, ForeignKey("classrooms.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    event_type = Column(String, nullable=False)  # "quiz_completed", "badge_earned", "streak", "joined", "material_added"
    event_data = Column(JSON, default=dict)  # flexible payload
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    classroom = relationship("Classroom")
    user = relationship("User")


# ===== Notifications =====


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # "announcement", "quiz_published", "badge_earned", "challenge_new", "leaderboard"
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    link = Column(String, nullable=True)  # optional route to navigate to
    meta = Column(JSON, default=dict)  # flexible payload (classroom_id, quiz_id, etc.)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


# ===== Profile System: Titles =====


class Title(Base):
    __tablename__ = "titles"

    id = Column(String, primary_key=True, default=generate_uuid)
    key = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)  # Display name e.g. "Quiz Slayer"
    description = Column(String, nullable=False)  # How to unlock
    rarity = Column(String, default="common")  # common, rare, epic, legendary
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserTitle(Base):
    __tablename__ = "user_titles"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title_key = Column(String, ForeignKey("titles.key"), nullable=False)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    title = relationship("Title")
