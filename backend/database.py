"""
REACH — Database engine and session
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# E-60: burst tuning for "everyone opens the app right after service ends."
# SQLAlchemy's defaults (pool_size=5, max_overflow=10) are sized for a
# steady trickle of requests, not a spike of every hub leader + volunteer
# hitting the dashboard within the same couple of minutes. Bumped and made
# configurable via env vars so this can be tuned per Render plan without a
# code change — Render's paid tiers give more DB connections headroom than
# the free tier, and Supabase's own connection limit (check Settings →
# Database → Connection pooling) is the real ceiling to watch.
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_pool_kwargs = {} if _is_sqlite else {
    "pool_size": settings.DB_POOL_SIZE,
    "max_overflow": settings.DB_MAX_OVERFLOW,
    "pool_timeout": settings.DB_POOL_TIMEOUT_SECONDS,
}

engine = create_engine(
    settings.DATABASE_URL or "sqlite:///./reach_dev.db",
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=settings.ENVIRONMENT == "development",
    **_pool_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
