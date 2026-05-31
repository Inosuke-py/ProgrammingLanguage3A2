"""
Unified AI client that supports Mistral API (primary) and Ollama (fallback).
"""

import asyncio
import time
import httpx
import json
from app.config import get_settings

settings = get_settings()


# ─── Global Mistral rate limiter ──────────────────────────────────────────────
# Mistral free tier allows ~1 request per second. We enforce this across ALL
# callers (pool worker + user requests) at the dispatch boundary.
#
# Multiple coroutines can sit waiting at .acquire() concurrently — they're
# released one at a time, each at least MIN_INTERVAL apart. This means N users
# clicking "Generate" simultaneously will see their calls naturally space out
# instead of all colliding into 429s.

_MIN_INTERVAL_SECONDS = 1.1


class _MistralRateLimiter:
    """Async fair-queue limiter: serialize HTTP dispatches to Mistral."""

    def __init__(self, min_interval: float = _MIN_INTERVAL_SECONDS):
        self._lock = asyncio.Lock()
        self._next_allowed_at = 0.0
        self.min_interval = min_interval

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed_at - now
            if wait > 0:
                await asyncio.sleep(wait)
            # Reserve the slot for the next caller
            self._next_allowed_at = time.monotonic() + self.min_interval


_mistral_limiter = _MistralRateLimiter()


async def generate_text(prompt: str, temperature: float = 0.7, max_tokens: int = 4096) -> str | None:
    """
    Generate text using the configured AI backend.
    Returns the raw text response, or None on failure.
    """
    if settings.ai_backend == "mistral" and settings.mistral_api_key:
        return await _generate_mistral(prompt, temperature, max_tokens)
    else:
        return await _generate_ollama(prompt, temperature, max_tokens)


async def generate_json(prompt: str, temperature: float = 0.7, max_tokens: int = 4096) -> list | dict | None:
    """
    Generate and parse JSON from the AI.
    Returns parsed JSON (list or dict), or None on failure.
    """
    raw = await generate_text(prompt, temperature, max_tokens)
    if not raw:
        return None
    return _parse_json_response(raw)


async def _generate_mistral(prompt: str, temperature: float, max_tokens: int) -> str | None:
    """Call Mistral API with retry on transient failures.

    Acquires a slot from the global rate limiter so concurrent callers
    (multiple users + the background pool worker) get serialized to ≥1 req/sec
    instead of stampeding into 429s.
    """
    max_retries = 3
    for attempt in range(max_retries):
        try:
            await _mistral_limiter.acquire()
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://api.mistral.ai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.mistral_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.mistral_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "response_format": {"type": "json_object"},
                    },
                )

            if response.status_code != 200:
                print(f"[ai_client] Mistral API error {response.status_code}: {response.text[:200]}")
                if response.status_code in (429, 500, 502, 503):
                    # Retryable error — back off, then loop will re-acquire a fresh slot
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                # Non-retryable error, fallback to Ollama
                return await _generate_ollama(prompt, temperature, max_tokens)

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return content.strip()

        except Exception as e:
            print(f"[ai_client] Mistral attempt {attempt + 1}/{max_retries} failed: {type(e).__name__}: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            # All retries exhausted, fallback to Ollama
            return await _generate_ollama(prompt, temperature, max_tokens)

    return await _generate_ollama(prompt, temperature, max_tokens)


async def _generate_ollama(prompt: str, temperature: float, max_tokens: int) -> str | None:
    """Call local Ollama."""
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{settings.ollama_base_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
            )

        if response.status_code != 200:
            print(f"[ai_client] Ollama error {response.status_code}")
            return None

        result = response.json()
        return result.get("response", "").strip()

    except Exception as e:
        print(f"[ai_client] Ollama exception: {type(e).__name__}: {e}")
        return None


def _parse_json_response(raw_text: str) -> list | dict | None:
    """Parse JSON from AI response, handling common formatting issues."""
    import re

    text = raw_text.strip()

    # Remove markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
    if text.endswith("```"):
        text = text[:-3]

    # Try to find JSON array or object
    # First try: parse the whole thing
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Second try: find array brackets
    start_idx = text.find("[")
    end_idx = text.rfind("]")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            return json.loads(text[start_idx:end_idx + 1])
        except json.JSONDecodeError:
            pass

    # Third try: find object braces (for single JSON object with "questions" key)
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            obj = json.loads(text[start_idx:end_idx + 1])
            # If it has a "questions" key, return that list
            if isinstance(obj, dict) and "questions" in obj:
                return obj["questions"]
            return obj
        except json.JSONDecodeError:
            pass

    # Fourth try: fix trailing commas and retry
    cleaned = re.sub(r',\s*([}\]])', r'\1', text)
    start_idx = cleaned.find("[")
    end_idx = cleaned.rfind("]")
    if start_idx != -1 and end_idx != -1:
        try:
            return json.loads(cleaned[start_idx:end_idx + 1])
        except json.JSONDecodeError:
            pass

    # Fifth try: extract individual JSON objects
    objects = re.findall(r'\{[^{}]+\}', text)
    if objects:
        parsed = []
        for obj_str in objects:
            try:
                parsed.append(json.loads(obj_str))
            except json.JSONDecodeError:
                continue
        if parsed:
            return parsed

    print(f"[ai_client] Failed to parse JSON. First 300 chars: {raw_text[:300]}")
    return None
