"""
REACH — Shared rate limiter instance.

Pulled into its own module (rather than defined in main.py) so router
modules can import the same `limiter` object and apply per-endpoint
`@limiter.limit(...)` decorators without a circular import back to main.py.

D-42: storage backend is Redis when REDIS_URL is configured (shared state
across worker processes, survives deploy/restart) and falls back to
in-memory only for local dev without Redis.
"""
from fastapi import Request
from slowapi import Limiter

from .config import settings


def _get_real_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=_get_real_ip,
    default_limits=["300/minute"],
    storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://",
)
