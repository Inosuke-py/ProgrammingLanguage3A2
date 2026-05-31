# Kino — Product Context

## Product Purpose

Kino is a web app that turns uploaded study materials (PDFs) into gamified quizzes. It closes the learning loop: every wrong answer teaches, not just penalizes. Users upload, quiz, streak, and master.

## Register

brand

## Users

- **Primary**: Students (high school, college) preparing for exams
- **Secondary**: Teachers assigning materials and tracking class progress
- **Tertiary**: Lifelong learners refining knowledge in any subject

They study on laptops and phones, often late at night or between classes. They dread passive re-reading and want something that feels like progress.

## Brand Personality

Energetic, playful, warm, encouraging. The intersection of "game you want to play" and "tutor who believes in you." Never dry, never dead, never clinical.

## Voice & Tone

- Casual, direct, confident
- Uses gaming language naturally (streaks, XP, levels, runs) without being childish
- Encouraging without being patronizing
- Short sentences, active voice
- No jargon about the underlying tech (no "AI model," "Ollama," "local inference")

## Anti-References (what Kino must NOT look or feel like)

- Generic SaaS landing pages with blue gradients and stock photos
- Dry academic tools (Quizlet's blandness, Anki's utilitarian UI)
- Overly corporate edtech (Canvas, Blackboard)
- Neon-on-black crypto/gaming aesthetic (too aggressive)
- Duolingo green (too childish, too specific to language learning)

## Strategic Principles

1. The page should feel like booting up a game, not opening a textbook
2. Dark mode is intentional: students study at night, screens glow in dim rooms
3. Warmth comes from the gold accent, not from pastel softness
4. Every interaction should feel responsive and alive
5. Information is about what users experience, not what tech powers it
6. Sign-up is required (Google Auth) but the barrier should feel low
7. Free forever, no hidden costs, no premium tier (for now)

## Key Flows

1. Land on page → Sign up with Google → Upload PDF → Take quiz
2. Return visit → Continue where you left off → Track mastery decay
3. Wrong answer → See source paragraph → "Explain like I'm 12" → Retry

## Tech (internal, not user-facing)

- React + TypeScript + Tailwind (frontend)
- Python + FastAPI (backend)
- Ollama + Mistral (local AI, never mentioned to users)
- Google OAuth 2.0 (auth)
- PostgreSQL (data)
