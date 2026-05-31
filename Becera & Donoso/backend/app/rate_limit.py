"""Shared rate limiter for the whole app.

Uses slowapi (a Flask-Limiter port for Starlette/FastAPI). Limits are keyed
by client IP. For routes behind authentication, you can pass a custom key
function later if you want per-user limits.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address


limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
