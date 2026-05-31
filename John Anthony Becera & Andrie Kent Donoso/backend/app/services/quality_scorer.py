"""
Question quality scoring.
Assigns a 0-100 quality score based on heuristics (no AI call needed).
Flags questions that score below threshold for admin review.
"""

FLAG_THRESHOLD = 40  # Questions scoring below this get flagged


def score_question(content: str, options: list, correct_answer: str, explanation: str, source_text: str, qtype: str) -> int:
    """
    Score a question's quality from 0-100 based on heuristics.
    
    Criteria:
    - Content length and clarity
    - Option quality (distinct, reasonable length)
    - Has explanation
    - Has source text
    - No obvious issues (duplicate options, too-short content)
    """
    score = 50  # Start at neutral

    # Content quality (0-20 points)
    content_words = len(content.split())
    if content_words >= 8:
        score += 10
    elif content_words >= 5:
        score += 5
    else:
        score -= 10  # Too short

    if content.endswith('?') or '___' in content or content.endswith('.'):
        score += 5  # Proper question format
    
    if content_words > 50:
        score -= 5  # Too verbose

    # Options quality (0-20 points)
    if len(options) >= 4 and qtype == 'mcq':
        score += 5
    elif len(options) >= 2:
        score += 3

    # Check for duplicate options
    unique_options = set(o.strip().lower() for o in options)
    if len(unique_options) < len(options):
        score -= 15  # Duplicate options is a serious issue

    # Check option lengths are reasonable
    option_lengths = [len(o.split()) for o in options]
    if all(l >= 1 for l in option_lengths):
        score += 5
    if any(l > 30 for l in option_lengths):
        score -= 5  # Options too long

    # Correct answer validation (0-10 points)
    if correct_answer in options:
        score += 10
    else:
        score -= 20  # Critical: answer not in options

    # Explanation quality (0-10 points)
    if explanation and len(explanation.split()) >= 5:
        score += 10
    elif explanation and len(explanation.split()) >= 2:
        score += 5
    else:
        score -= 5  # No explanation

    # Source text (0-10 points)
    if source_text and len(source_text) > 20:
        score += 10
    elif source_text:
        score += 5

    # Type-specific checks
    if qtype == 'true_false' and len(options) != 2:
        score -= 10
    if qtype == 'fill_blank' and '___' not in content:
        score -= 10

    # Clamp to 0-100
    return max(0, min(100, score))


def should_flag(score: int) -> bool:
    """Determine if a question should be flagged for review."""
    return score < FLAG_THRESHOLD
