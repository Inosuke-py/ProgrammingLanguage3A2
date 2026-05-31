"""Quiz generation service using Mistral API or Ollama."""

from app.services.ai_client import generate_json


async def generate_questions(
    content: str,
    question_count: int = 5,
    question_types: list[str] | None = None,
) -> list[dict]:
    """
    Generate quiz questions from a text section.

    Args:
        content: The source text to generate questions from
        question_count: Number of questions to generate
        question_types: List of types to include ("mcq", "true_false", "fill_blank")

    Returns:
        List of question dicts ready to be stored
    """
    if question_types is None:
        question_types = ["mcq", "true_false"]

    types_str = ", ".join(question_types)

    prompt = f"""Generate exactly {question_count} quiz questions from the text below.
Types to include: {types_str}

Respond with a JSON object: {{"questions": [...]}}

Each question must have:
- "type": one of {types_str}
- "content": the question text
- "options": array of answer choices (4 for mcq, 2 for true_false, 4 for fill_blank)
- "correct_answer": must exactly match one of the options
- "explanation": brief explanation of why the answer is correct
- "source_text": the sentence from the passage that supports the answer

Text:
{content}"""

    result = await generate_json(prompt, temperature=0.7, max_tokens=4096)

    if not result:
        return []

    # Handle both list and dict with "questions" key
    questions = result if isinstance(result, list) else result.get("questions", []) if isinstance(result, dict) else []

    # Validate
    validated = []
    for q in questions:
        content_text = q.get("content") or q.get("question", "")
        options = q.get("options") or q.get("choices", [])
        correct = q.get("correct_answer") or q.get("answer", "")
        qtype = q.get("type", "mcq")

        if not content_text or not options or not correct:
            continue
        if correct not in options:
            # Try stripped match
            stripped = [o.strip() for o in options]
            if correct.strip() in stripped:
                correct = options[stripped.index(correct.strip())]
            else:
                continue

        if qtype not in ("mcq", "true_false", "fill_blank", "matching", "ordering"):
            qtype = "true_false" if len(options) == 2 else "mcq"

        validated.append({
            "type": qtype,
            "content": content_text,
            "options": options,
            "correct_answer": correct,
            "explanation": q.get("explanation", ""),
            "source_text": q.get("source_text", ""),
        })

    return validated
