import os
import asyncio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.database import engine, Base
from app.rate_limit import limiter
from app.routers import (
    auth_router, materials_router, quiz_router, explain_router,
    interactive_router, annotations_router, custom_questions_router,
    flashcards_router, badges_router,
    sharing_router, shared_with_me_router, battles_router,
    rooms_router, classrooms_router, leaderboard_router,
    dashboard_router, challenges_router, admin_router, ws_router,
    notifications_router, users_router, profile_router,
)

settings = get_settings()
IS_PROD = os.getenv("ENV", "dev").lower() == "production"

# Create tables (idempotent — safe across restarts)
Base.metadata.create_all(bind=engine)

# In production, disable Swagger UI / ReDoc / OpenAPI schema to reduce surface area.
app = FastAPI(
    title="Kino API",
    description="AI-powered interactive quiz generator",
    version="0.1.0",
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Explicit allow-list. Reflecting arbitrary origins with credentials is unsafe.
ALLOWED_ORIGINS = [
    "https://mykino.fun",
    "https://www.mykino.fun",
    "http://localhost:5173",  # local dev
    "http://localhost:5174",  # local dev (vite alt)
]
# Allow extending via env var: ALLOWED_ORIGINS=https://a.com,https://b.com
extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if extra_origins:
    ALLOWED_ORIGINS.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["Content-Disposition"],
    max_age=3600,
)


# ─── Rate limiting ────────────────────────────────────────────────────────────
# Per-IP limits via slowapi. Default cap is 300/minute (set in app.rate_limit).
# Hot endpoints can stack tighter limits with the @limiter.limit decorator.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# Start background pool worker on app startup
@app.on_event("startup")
async def startup_event():
    from app.services.pool_worker import run_pool_worker
    asyncio.create_task(run_pool_worker())


# Routers
app.include_router(auth_router.router, prefix="/api")
app.include_router(materials_router.router, prefix="/api")
app.include_router(quiz_router.router, prefix="/api")
app.include_router(explain_router.router, prefix="/api")
app.include_router(interactive_router.router, prefix="/api")
app.include_router(annotations_router.router, prefix="/api")
app.include_router(custom_questions_router.router, prefix="/api")
app.include_router(flashcards_router.router, prefix="/api")
app.include_router(badges_router.router, prefix="/api")
app.include_router(sharing_router.router, prefix="/api")
app.include_router(shared_with_me_router.router, prefix="/api")
app.include_router(battles_router.router, prefix="/api")
app.include_router(rooms_router.router, prefix="/api")
app.include_router(classrooms_router.router, prefix="/api")
app.include_router(leaderboard_router.router, prefix="/api")
app.include_router(dashboard_router.router, prefix="/api")
app.include_router(challenges_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")
app.include_router(notifications_router.router, prefix="/api")
app.include_router(users_router.router, prefix="/api")
app.include_router(profile_router.router, prefix="/api")
app.include_router(ws_router.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/public/stats")
@limiter.limit("60/minute")
async def public_stats(request: Request):
    """Public landing-page stats (no auth required)."""
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models import User, Material, Attempt, QuestionPool, Question
    from sqlalchemy import func
    from datetime import datetime, timezone, timedelta

    db: Session = SessionLocal()
    try:
        pool_count = db.query(func.count(QuestionPool.id)).scalar() or 0
        classroom_q_count = db.query(func.count(Question.id)).scalar() or 0
        total_questions = pool_count + classroom_q_count

        total_sessions = (
            db.query(func.count(Attempt.id))
            .filter(Attempt.completed_at.isnot(None))
            .scalar()
        ) or 0

        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        active_learners = (
            db.query(func.count(func.distinct(Attempt.user_id)))
            .filter(Attempt.started_at >= thirty_days_ago)
            .scalar()
        ) or 0

        return {
            "total_questions": total_questions,
            "total_sessions": total_sessions,
            "active_learners": active_learners,
        }
    finally:
        db.close()


@app.get("/api/public/sample-question")
@limiter.limit("60/minute")
async def public_sample_question(request: Request):
    """Public sample question from the pool for the landing page hero."""
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models import QuestionPool
    from sqlalchemy import func
    from fastapi.responses import JSONResponse

    db: Session = SessionLocal()
    try:
        question = (
            db.query(QuestionPool)
            .filter(QuestionPool.type == "mcq", QuestionPool.flagged == False)
            .order_by(func.random())
            .first()
        )

        if not question:
            payload = {
                "content": "What is the powerhouse of the cell?",
                "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"],
                "correct_answer": "Mitochondria",
            }
        else:
            payload = {
                "content": question.content,
                "options": question.options,
                "correct_answer": question.correct_answer,
            }

        # Random pick — never cache, otherwise users see the same question forever
        return JSONResponse(content=payload, headers={"Cache-Control": "no-store"})
    finally:
        db.close()


@app.get("/api/public/sample-quiz")
@limiter.limit("30/minute")
async def public_sample_quiz(request: Request, count: int = 10):
    """Public sample quiz (multiple questions) for the landing page interactive demo."""
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models import QuestionPool
    from sqlalchemy import func
    from fastapi.responses import JSONResponse

    # Clamp count to prevent abuse
    count = max(1, min(count, 50))

    db: Session = SessionLocal()
    try:
        questions = (
            db.query(QuestionPool)
            .filter(QuestionPool.type == "mcq", QuestionPool.flagged == False)
            .order_by(func.random())
            .limit(count)
            .all()
        )

        if not questions:
            payload = {
                "questions": [
                    {"content": "What is the powerhouse of the cell?", "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"], "correct_answer": "Mitochondria"},
                    {"content": "Which planet is closest to the sun?", "options": ["Venus", "Earth", "Mercury", "Mars"], "correct_answer": "Mercury"},
                    {"content": "What is the chemical symbol for gold?", "options": ["Go", "Gd", "Au", "Ag"], "correct_answer": "Au"},
                ]
            }
        else:
            payload = {
                "questions": [
                    {"content": q.content, "options": q.options, "correct_answer": q.correct_answer}
                    for q in questions
                ]
            }

        # Random pick — never cache so refreshes always pull a fresh set
        return JSONResponse(content=payload, headers={"Cache-Control": "no-store"})
    finally:
        db.close()
