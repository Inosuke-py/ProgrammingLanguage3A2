"""
Content validation for uploaded study materials.
Checks that parsed content is meaningful and not gibberish.
"""

import re
from typing import Tuple


def validate_content(sections: list[dict]) -> Tuple[bool, str]:
    """
    Validate that parsed sections contain meaningful study content.
    
    Returns (is_valid, reason).
    """
    if not sections:
        return False, "No readable content found in the file. The file may be empty, image-only, or corrupted."

    # Check total text length
    total_text = " ".join(s.get("content", "") for s in sections)
    total_words = len(total_text.split())

    if total_words < 50:
        return False, f"Too little text content ({total_words} words). The file needs at least 50 words of readable text to generate questions."

    # Check for gibberish: high ratio of non-alphabetic characters
    alpha_chars = sum(1 for c in total_text if c.isalpha())
    total_chars = len(total_text)
    if total_chars > 0:
        alpha_ratio = alpha_chars / total_chars
        if alpha_ratio < 0.4:
            return False, "The file content appears to be mostly non-text (symbols, numbers, or encoded data). Upload a file with readable study text."

    # Check for meaningful words: at least some words should be 3+ characters
    words = total_text.split()
    meaningful_words = [w for w in words if len(w) >= 3 and w.isalpha()]
    if len(meaningful_words) < 20:
        return False, "The file doesn't contain enough meaningful text. It may be a form, spreadsheet, or mostly images."

    # Check for repetitive content (same line repeated many times)
    lines = [s.get("content", "").strip() for s in sections]
    if lines:
        unique_lines = set(lines)
        if len(unique_lines) == 1 and len(lines) > 3:
            return False, "The file contains repetitive content (same text on every page). Upload a file with varied study material."

    # Check average section length (very short sections = likely not study material)
    avg_section_length = total_words / len(sections)
    if avg_section_length < 10 and len(sections) > 5:
        return False, "The file has very little text per page. It may be mostly images or diagrams. Upload a text-rich study material."

    # Check for common non-content patterns (e.g., just page numbers, headers)
    non_content_patterns = [
        r'^\d+$',  # just numbers
        r'^page \d+$',  # page numbers
        r'^(confidential|draft|internal)$',  # watermarks
    ]
    content_sections = 0
    for section in sections:
        content = section.get("content", "").strip().lower()
        is_non_content = any(re.match(p, content) for p in non_content_patterns)
        if not is_non_content and len(content) > 30:
            content_sections += 1

    if content_sections < 2:
        return False, "Not enough substantive content found. The file may be mostly headers, page numbers, or short labels."

    return True, "Content validated successfully."


def get_content_stats(sections: list[dict]) -> dict:
    """Get statistics about the parsed content for display."""
    total_text = " ".join(s.get("content", "") for s in sections)
    words = total_text.split()
    
    return {
        "total_sections": len(sections),
        "total_words": len(words),
        "avg_words_per_section": round(len(words) / max(len(sections), 1)),
        "estimated_questions": min(len(words) // 25, 150),  # rough estimate
    }
