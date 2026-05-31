"""
Background pool worker with FIFO queue.
Generates questions for materials using Mistral API (primary) or Ollama (fallback).
Processes one material at a time in queue order to avoid race conditions.
"""

import asyncio
from collections import deque
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import SessionLocal
from app.models import Material, QuestionPool
from app.services.ai_client import generate_json

# ─── Configuration ─────────────────────────────────────────────────────────────

POOL_CAP = 150
TARGET_EASY = 45
TARGET_MEDIUM = 60
TARGET_HARD = 45
BATCH_SIZE = 15
CHECK_INTERVAL = 45  # seconds between queue checks
# Note: rate limiting is now handled inside ai_client._mistral_limiter, so the
# worker no longer needs its own delay. The limiter automatically yields to
# higher-priority user-initiated calls (everyone shares the same fair queue).

# ─── Queue ─────────────────────────────────────────────────────────────────────

_generation_queue: deque[str] = deque()
_processing: set[str] = set()
_failed_attempts: dict[str, int] = {}  # material_id -> consecutive failures
MAX_CONSECUTIVE_FAILURES = 3
FAILURE_COOLDOWN = 300  # seconds to wait before retrying a failed material


def enqueue_material(material_id: str):
    """Add a material to the generation queue (priority: front of queue)."""
    if material_id not in _processing and material_id not in _generation_queue:
        _generation_queue.appendleft(material_id)
        print(f"[pool-worker] Queued material {material_id} (queue size: {len(_generation_queue)})")


def enqueue_material_low_priority(material_id: str):
    """Add a material to the back of the generation queue."""
    if material_id not in _processing and material_id not in _generation_queue:
        _generation_queue.append(material_id)


def get_queue_status() -> dict:
    """Get current queue status for debugging/monitoring."""
    return {
        "queue_size": len(_generation_queue),
        "processing": list(_processing),
        "queued": list(_generation_queue),
    }


# ─── Prompts ───────────────────────────────────────────────────────────────────

PROMPT_TEMPLATE = """Generate exactly {count} {difficulty} quiz questions based on the study material below.

You MUST respond with a JSON object: {{"questions": [...]}}

Each question must follow one of these formats:

MCQ (multiple choice, 4 options):
{{"type":"mcq","difficulty":"{difficulty}","content":"Clear, specific question?","options":["Option A","Option B","Option C","Option D"],"correct_answer":"Option A","explanation":"Why this is correct","source_text":"relevant quote from material"}}

True/False (statement to evaluate):
{{"type":"true_false","difficulty":"{difficulty}","content":"A clear factual statement.","options":["True","False"],"correct_answer":"True","explanation":"Why true/false","source_text":"relevant quote"}}

Fill in the Blank (use ___ for the blank):
{{"type":"fill_blank","difficulty":"{difficulty}","content":"The ___ is responsible for X.","options":["correct term","distractor 1","distractor 2","distractor 3"],"correct_answer":"correct term","explanation":"Why this fills the blank","source_text":"relevant quote"}}

Matching (match items to descriptions):
{{"type":"matching","difficulty":"{difficulty}","content":"Match each term with its definition","options":["Term1 - Definition1","Term2 - Definition2","Term3 - Definition3","Term4 - Definition4"],"correct_answer":"Term1 - Definition1","explanation":"Correct pairings","source_text":"relevant quote"}}

Ordering (arrange in correct sequence):
{{"type":"ordering","difficulty":"{difficulty}","content":"Arrange these steps in the correct order","options":["Step 1","Step 2","Step 3","Step 4"],"correct_answer":"Step 1","explanation":"Correct sequence as listed in options","source_text":"relevant quote"}}

QUALITY RULES:
- correct_answer MUST exactly match one of the options (character for character)
- Questions must be directly answerable from the material provided
- Distractors must be plausible but clearly wrong
- No trick questions or ambiguous wording
- Each question tests a different concept (no repetition)
- {difficulty_desc}
- Generate a MIX of types: at least 2 different question types per batch

STUDY MATERIAL:
{material_text}

Respond with ONLY the JSON object. Start with {{ immediately."""

DIFFICULTY_DESCRIPTIONS = {
    "easy": "EASY: Test recall of facts, definitions, names, dates, and basic concepts directly stated in the text. Questions should be straightforward with one clearly correct answer.",
    "medium": "MEDIUM: Test understanding of relationships, cause-effect, comparisons, and application of concepts. Require inference but answers are still findable in the text.",
    "hard": "HARD: Test analysis, evaluation, and synthesis of multiple ideas. Use tricky but fair distractors. May require combining information from different parts of the material.",
}

# Survival-mode prompt: mixed difficulty + mixed types in a single batch.
# These questions are exclusive to a single survival session and never enter QuestionPool.
SURVIVAL_PROMPT_TEMPLATE = """Generate exactly {count} mixed-difficulty quiz questions based on the study material below for SURVIVAL MODE.

In Survival Mode the user has 3 hearts and answers endlessly until they run out. Questions must vary in difficulty and type so the run feels alive and unpredictable.

You MUST respond with a JSON object: {{"questions": [...]}}

Each question must follow one of these formats (rotate types):

MCQ (4 options):
{{"type":"mcq","difficulty":"easy|medium|hard","content":"Clear, specific question?","options":["Option A","Option B","Option C","Option D"],"correct_answer":"Option A","explanation":"Why this is correct","source_text":"relevant quote"}}

True/False:
{{"type":"true_false","difficulty":"easy|medium|hard","content":"A clear factual statement.","options":["True","False"],"correct_answer":"True","explanation":"Why true/false","source_text":"relevant quote"}}

Fill in the Blank (use ___ for the blank):
{{"type":"fill_blank","difficulty":"easy|medium|hard","content":"The ___ is responsible for X.","options":["correct term","distractor 1","distractor 2","distractor 3"],"correct_answer":"correct term","explanation":"Why this fills the blank","source_text":"relevant quote"}}

QUALITY RULES:
- correct_answer MUST exactly match one of the options (character for character)
- Mix difficulties: roughly 1/3 easy, 1/3 medium, 1/3 hard
- Mix at least 2 different question types in the batch
- Questions must be directly answerable from the material provided
- Distractors must be plausible but clearly wrong
- Each question tests a different concept (no repetition)
- These questions are EXCLUSIVE to this survival run — make them fresh and engaging

STUDY MATERIAL:
{material_text}

Respond with ONLY the JSON object. Start with {{ immediately."""


# ─── Pool Distribution ─────────────────────────────────────────────────────────

def get_pool_distribution(db: Session, material_id: str) -> dict:
    """Get current difficulty distribution for a material's pool."""
    counts = (
        db.query(QuestionPool.difficulty, func.count(QuestionPool.id))
        .filter(QuestionPool.material_id == material_id)
        .group_by(QuestionPool.difficulty)
        .all()
    )
    dist = {"easy": 0, "medium": 0, "hard": 0}
    for difficulty, count in counts:
        if difficulty in dist:
            dist[difficulty] = count
    return dist


def get_needed_difficulty(dist: dict) -> str | None:
    """Determine which difficulty needs more questions."""
    if dist["easy"] < TARGET_EASY:
        return "easy"
    if dist["medium"] < TARGET_MEDIUM:
        return "medium"
    if dist["hard"] < TARGET_HARD:
        return "hard"
    return None


# ─── Batch Generation ──────────────────────────────────────────────────────────

async def generate_batch(material_id: str, db: Session, target_difficulty: str, count: int = BATCH_SIZE) -> int:
    """Generate a batch of questions at a specific difficulty level."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        return 0

    sections = sorted(material.sections, key=lambda s: s.order_index)
    if not sections:
        return 0

    # Build material text — use more context for better questions (5000 chars)
    material_text = ""
    for section in sections:
        chunk = section.content[:800]
        header = section.title or f"Page {section.page_number}"
        material_text += f"\n\n--- {header} ---\n{chunk}"
        if len(material_text) > 5000:
            break

    prompt = PROMPT_TEMPLATE.format(
        count=count,
        difficulty=target_difficulty,
        difficulty_desc=DIFFICULTY_DESCRIPTIONS[target_difficulty],
        material_text=material_text.strip(),
    )

    # Call AI
    result = await generate_json(prompt, temperature=0.75, max_tokens=6000)

    if not result:
        print(f"[pool-worker] No valid response from AI for {material.title}")
        return 0

    # Handle both list and dict responses
    questions = result if isinstance(result, list) else result.get("questions", []) if isinstance(result, dict) else []

    if not questions:
        print(f"[pool-worker] Empty questions array for {material.title}")
        return 0

    print(f"[pool-worker] Got {len(questions)} candidates for '{material.title}', validating...")

    # Re-verify material still exists before inserting
    if not db.query(Material).filter(Material.id == material_id).first():
        print(f"[pool-worker] Material {material_id} deleted during generation.")
        return 0

    # Get existing questions for deduplication
    existing_contents = set(
        row[0] for row in db.query(QuestionPool.content).filter(
            QuestionPool.material_id == material_id
        ).all()
    )

    # Validate and store
    stored = 0
    for q in questions:
        content = q.get("content") or q.get("question") or q.get("text", "")
        options = q.get("options") or q.get("choices") or []
        correct = q.get("correct_answer") or q.get("answer") or q.get("correct", "")

        if not content or not options or not correct:
            continue

        # Validate correct_answer matches an option
        matched = correct in options
        if not matched:
            stripped_options = [o.strip() for o in options]
            if correct.strip() in stripped_options:
                correct = options[stripped_options.index(correct.strip())]
                matched = True
        if not matched:
            # Try letter-based answer (A, B, C, D)
            if correct.upper() in ['A', 'B', 'C', 'D'] and len(options) >= ord(correct.upper()) - ord('A') + 1:
                correct = options[ord(correct.upper()) - ord('A')]
                matched = True
        if not matched:
            continue

        qtype = q.get("type", "mcq")
        if qtype not in ("mcq", "true_false", "fill_blank", "matching", "ordering"):
            qtype = "true_false" if len(options) == 2 else "mcq"

        # Deduplication: exact match
        if content in existing_contents:
            continue

        # Deduplication: word overlap check (>80% similar = duplicate)
        is_dup = False
        words_new = set(content.lower().split())
        for ex_content in existing_contents:
            words_ex = set(ex_content.lower().split())
            if words_new and words_ex:
                overlap = len(words_new & words_ex) / min(len(words_new), len(words_ex))
                if overlap > 0.8:
                    is_dup = True
                    break
        if is_dup:
            continue

        # Quality scoring
        from app.services.quality_scorer import score_question, should_flag
        explanation_text = q.get("explanation", "")
        source_text = q.get("source_text", "")
        q_score = score_question(content, options, correct, explanation_text, source_text, qtype)

        pool_item = QuestionPool(
            material_id=material_id,
            section_id=None,
            type=qtype,
            difficulty=target_difficulty,
            content=content,
            options=options,
            correct_answer=correct,
            explanation=explanation_text,
            source_text=source_text,
            quality_score=q_score,
            flagged=should_flag(q_score),
        )
        db.add(pool_item)
        existing_contents.add(content)
        stored += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[pool-worker] Commit failed: {e}")
        return 0

    return stored


# ─── Main Worker Loop ──────────────────────────────────────────────────────────

async def run_pool_worker():
    """
    Main worker loop with FIFO queue.
    
    Priority order:
    1. Items in the queue (newly uploaded materials get priority)
    2. Existing materials that haven't reached pool cap
    
    Only one material is processed at a time — no race conditions.
    """
    print(f"[pool-worker] Started. Pool cap: {POOL_CAP} (easy:{TARGET_EASY} / med:{TARGET_MEDIUM} / hard:{TARGET_HARD})")
    print(f"[pool-worker] Batch size: {BATCH_SIZE}, check interval: {CHECK_INTERVAL}s, rate limit handled by ai_client")

    while True:
        try:
            db = SessionLocal()

            # Step 1: Process queued items first (high priority)
            material_id = None
            if _generation_queue:
                material_id = _generation_queue.popleft()
            else:
                # Step 2: Find materials that need more questions (skip failed ones)
                materials = db.query(Material).filter(Material.processed == True).all()
                for mat in materials:
                    # Skip materials that have failed too many times recently
                    if _failed_attempts.get(mat.id, 0) >= MAX_CONSECUTIVE_FAILURES:
                        continue

                    # Skip classroom-only materials (assigned to classroom but never had pool generation)
                    from app.models import ClassroomAssignment
                    is_classroom_only = db.query(ClassroomAssignment).filter(
                        ClassroomAssignment.material_id == mat.id
                    ).first() is not None
                    existing_pool = db.query(QuestionPool).filter(QuestionPool.material_id == mat.id).count()
                    if is_classroom_only and existing_pool == 0:
                        continue

                    total = db.query(QuestionPool).filter(
                        QuestionPool.material_id == mat.id
                    ).count()
                    if total < POOL_CAP:
                        dist = get_pool_distribution(db, mat.id)
                        needed = get_needed_difficulty(dist)
                        if needed:
                            material_id = mat.id
                            break

            if material_id:
                # Mark as processing
                _processing.add(material_id)

                # Verify material still exists
                material = db.query(Material).filter(Material.id == material_id).first()
                if material:
                    total = db.query(QuestionPool).filter(
                        QuestionPool.material_id == material_id
                    ).count()

                    if total < POOL_CAP:
                        dist = get_pool_distribution(db, material_id)
                        needed = get_needed_difficulty(dist)

                        if needed:
                            batch_count = min(BATCH_SIZE, POOL_CAP - total)
                            print(f"[pool-worker] Processing '{material.title}': {total}/{POOL_CAP} questions. Need '{needed}'. Generating {batch_count}...")
                            generated = await generate_batch(material_id, db, needed, batch_count)
                            print(f"[pool-worker] Generated {generated} {needed} questions for '{material.title}'.")

                            if generated == 0:
                                # Track failure
                                _failed_attempts[material_id] = _failed_attempts.get(material_id, 0) + 1
                                failures = _failed_attempts[material_id]
                                if failures >= MAX_CONSECUTIVE_FAILURES:
                                    print(f"[pool-worker] '{material.title}' failed {failures} times. Cooling down for {FAILURE_COOLDOWN}s.")
                            else:
                                # Reset failure count on success
                                _failed_attempts.pop(material_id, None)

                _processing.discard(material_id)

            db.close()

        except Exception as e:
            print(f"[pool-worker] Error: {e}")
            _processing.clear()

        # Wait before next check (shorter if queue has items)
        wait_time = 2 if _generation_queue else CHECK_INTERVAL
        await asyncio.sleep(wait_time)

        # Periodically reset failure counts so materials get retried
        if not _generation_queue and _failed_attempts:
            # Every 5 minutes, reduce failure counts by 1
            for mid in list(_failed_attempts.keys()):
                _failed_attempts[mid] -= 1
                if _failed_attempts[mid] <= 0:
                    del _failed_attempts[mid]


# ─── Survival On-Demand Generation ─────────────────────────────────────────────

async def generate_survival_questions(
    material_id: str,
    db: Session,
    count: int = 10,
    exclude_contents: set[str] | None = None,
) -> list[dict]:
    """
    Generate fresh, validated questions for a survival run.

    These questions are NEVER stored in QuestionPool — they exist only on the
    survival quiz that triggered this call. This guarantees standard quiz mode
    can never serve a question that was generated for someone's survival run.

    Returns a list of validated question dicts ready to be inserted as Question rows:
        {type, content, options, correct_answer, explanation, source_text}

    Args:
        material_id: Material to draw context from
        db: Active SQLAlchemy session
        count: How many questions to generate (default 10)
        exclude_contents: Set of question contents already used in this run, to
                         deduplicate against
    """
    from app.services.quality_scorer import score_question, should_flag

    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        return []

    sections = sorted(material.sections, key=lambda s: s.order_index)
    if not sections:
        return []

    # Build material context (5000 chars, like standard generation)
    material_text = ""
    for section in sections:
        chunk = section.content[:800]
        header = section.title or f"Page {section.page_number}"
        material_text += f"\n\n--- {header} ---\n{chunk}"
        if len(material_text) > 5000:
            break

    prompt = SURVIVAL_PROMPT_TEMPLATE.format(
        count=count,
        material_text=material_text.strip(),
    )

    # Slightly higher temp for variety across survival runs of the same material
    result = await generate_json(prompt, temperature=0.85, max_tokens=6000)
    if not result:
        print(f"[survival-gen] No AI response for '{material.title}'")
        return []

    raw_questions = (
        result if isinstance(result, list)
        else result.get("questions", []) if isinstance(result, dict)
        else []
    )
    if not raw_questions:
        print(f"[survival-gen] Empty questions for '{material.title}'")
        return []

    print(f"[survival-gen] Got {len(raw_questions)} candidates for survival run on '{material.title}', validating...")

    seen = set(exclude_contents or set())
    validated: list[dict] = []

    for q in raw_questions:
        content = q.get("content") or q.get("question") or q.get("text", "")
        options = q.get("options") or q.get("choices") or []
        correct = q.get("correct_answer") or q.get("answer") or q.get("correct", "")

        if not content or not options or not correct:
            continue

        # Validate correct_answer matches an option (with stripping + letter fallback)
        matched = correct in options
        if not matched:
            stripped_options = [o.strip() for o in options]
            if correct.strip() in stripped_options:
                correct = options[stripped_options.index(correct.strip())]
                matched = True
        if not matched and correct.upper() in ("A", "B", "C", "D"):
            idx = ord(correct.upper()) - ord("A")
            if idx < len(options):
                correct = options[idx]
                matched = True
        if not matched:
            continue

        qtype = q.get("type", "mcq")
        if qtype not in ("mcq", "true_false", "fill_blank", "matching", "ordering"):
            qtype = "true_false" if len(options) == 2 else "mcq"

        # Dedup: exact + word-overlap
        if content in seen:
            continue
        words_new = set(content.lower().split())
        is_dup = False
        for ex in seen:
            words_ex = set(ex.lower().split())
            if words_new and words_ex:
                overlap = len(words_new & words_ex) / min(len(words_new), len(words_ex))
                if overlap > 0.8:
                    is_dup = True
                    break
        if is_dup:
            continue

        explanation_text = q.get("explanation", "") or ""
        source_text = q.get("source_text", "") or ""
        q_score = score_question(content, options, correct, explanation_text, source_text, qtype)
        if should_flag(q_score):
            # Skip low-quality questions in survival — we want a tight experience
            continue

        validated.append({
            "type": qtype,
            "content": content,
            "options": options,
            "correct_answer": correct,
            "explanation": explanation_text,
            "source_text": source_text,
            "difficulty": q.get("difficulty", "medium"),
        })
        seen.add(content)

    print(f"[survival-gen] Validated {len(validated)} survival questions for '{material.title}'")
    return validated
