"""
REACH — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import time
import logging

from .config import settings
from .database import engine, Base, SessionLocal
from .models import *  # noqa

from .routers.auth import router as auth_router, onboarding_router
from .routers.invites import router as invites_router, admin_router as admin_invite_router
from .routers.users import router as users_router
from .routers.contacts import router as contacts_router
from .routers.templates import router as templates_router
from .routers.dashboard import router as dashboard_router
from .routers.management import hub_router, minister_router, campaign_router
from .routers.attendance import router as attendance_router
from .routers.decisions import router as decisions_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("reach")


def _get_real_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


if getattr(settings, "SENTRY_DSN", None):
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[FastApiIntegration()],
            environment=settings.ENVIRONMENT,
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
        logger.info("Sentry enabled")
    except Exception as e:
        logger.warning(f"Sentry init failed: {e}")

limiter = Limiter(key_func=_get_real_ip, default_limits=["300/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.ENVIRONMENT == "production" and settings.OTP_PROVIDER == "console":
        raise RuntimeError(
            "FATAL: OTP_PROVIDER=console is not allowed in production."
        )
    if settings.ENVIRONMENT == "development":
        Base.metadata.create_all(bind=engine)
        logger.info("Dev: tables ensured via create_all()")

    redis_url = getattr(settings, "REDIS_URL", None)
    if redis_url:
        try:
            from redis import asyncio as aioredis
            rc = aioredis.from_url(redis_url, decode_responses=True, socket_timeout=3)
            await rc.ping()
            app.state.redis = rc
            logger.info("Redis connected ✅")
        except Exception as e:
            logger.warning(f"Redis unavailable: {e}")
            app.state.redis = None
    else:
        logger.warning("REDIS_URL not set — caching disabled")
        app.state.redis = None

    try:
        from sqlalchemy import text as _t
        db = SessionLocal()
        db.execute(_t("SELECT 1"))
        db.close()
        logger.info("Database connected ✅")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")

    logger.info(f"REACH API starting — {settings.ENVIRONMENT}")

    # P2-6.2: Keep Supabase connection pool alive — prevents 50-100ms ping overhead
    # after idle periods. Pings every 5 minutes.
    import asyncio as _asyncio
    async def _pool_heartbeat():
        while True:
            await _asyncio.sleep(300)
            try:
                _db = SessionLocal()
                from sqlalchemy import text as _tx
                _db.execute(_tx("SELECT 1"))
                _db.close()
            except Exception as _e:
                logger.warning(f"Pool heartbeat failed: {_e}")
    _asyncio.create_task(_pool_heartbeat())

    yield


app = FastAPI(
    title="REACH API",
    description="Ministry Outreach Platform",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Session-Expired"],
)


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/onboarding/hubs":
        response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    elif path.startswith("/demographics"):
        response.headers["Cache-Control"] = "private, max-age=60, stale-while-revalidate=300"
    elif request.method == "GET" and "/dashboard" in path:
        response.headers["Cache-Control"] = "private, max-age=15, stale-while-revalidate=60"
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    # P3-1.9: X-Frame-Options removed — CSP frame-ancestors 'none' supersedes it in modern browsers
    response.headers["X-Content-Type-Options"]    = "nosniff"
    response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]        = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"]   = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https://res.cloudinary.com; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    for header in ("server", "x-powered-by"):
        if header in response.headers:
            del response.headers[header]
    return response


@app.middleware("http")
async def request_timing(request: Request, call_next):
    import uuid
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
    start = time.time()
    response = await call_next(request)
    elapsed = round((time.time() - start) * 1000, 1)
    response.headers["X-Request-ID"]    = request_id
    response.headers["X-Response-Time"] = f"{elapsed}ms"
    return response


@app.middleware("http")
async def enforce_https(request: Request, call_next):
    if settings.ENVIRONMENT == "production":
        if request.headers.get("X-Forwarded-Proto") == "http":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "HTTPS required"},
            )
    return await call_next(request)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {type(exc).__name__}"
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


# ─── Routers ──────────────────────────────────────────────────────────────────
# FIX-012: All API routes are served exclusively under /v1.
# Duplicate non-prefixed registrations removed — they bypassed rate-limiting on /v1/auth/send-otp
# and created an unintended public attack surface.
V1 = "/v1"
app.include_router(auth_router,        prefix=V1)
app.include_router(invites_router,     prefix=V1)
app.include_router(admin_invite_router,prefix=V1)
app.include_router(onboarding_router,  prefix=V1)
app.include_router(users_router,       prefix=V1)
app.include_router(contacts_router,    prefix=V1)
app.include_router(templates_router,   prefix=V1)
app.include_router(dashboard_router,   prefix=V1)
app.include_router(hub_router,         prefix=V1)
app.include_router(minister_router,    prefix=V1)
app.include_router(campaign_router,    prefix=V1)
app.include_router(attendance_router,  prefix=V1)
app.include_router(decisions_router,   prefix=V1)


@app.get("/health", include_in_schema=False)
async def health():
    from sqlalchemy import text as _t
    db_ok = False
    try:
        db = SessionLocal()
        db.execute(_t("SELECT 1"))
        db.close()
        db_ok = True
    except Exception as e:
        logger.error(f"Health DB check failed: {e}")
    redis_ok = None
    rc = getattr(app.state, "redis", None)
    if rc:
        try:
            await rc.ping()
            redis_ok = True
        except Exception:
            redis_ok = False
    return {
        "status":  "ok" if db_ok else "degraded",
        "db":      db_ok,
        "redis":   redis_ok,
        "service": "reach-api",
        "version": "1.0.0",
    }


@app.get("/")
async def root():
    return {"status": "ok", "service": "REACH API"}
