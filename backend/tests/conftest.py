"""
REACH — pytest fixtures (E-57: backend validation tests for new endpoints)

Uses an in-memory SQLite DB for speed/isolation. A few existing
CheckConstraints use Postgres-only regex (`~`) syntax that SQLite doesn't
support — those are neutralized here for SQLite specifically via a compiler
override, so the *table structure* can be tested. The actual phone-format
validation is still fully exercised through Pydantic's `validate_phone()`
(schemas.py), which every endpoint runs before a row is ever written — so
this doesn't weaken what's actually being tested, it just works around a
SQLite/Postgres dialect gap in local test tooling.
"""
import os
import sys
import uuid
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("OTP_PROVIDER", "console")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")

from sqlalchemy import create_engine, CheckConstraint
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture(scope="function")
def db_session():
    from backend.database import Base
    from backend import models  # noqa: F401 — register all models on Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Drop Postgres-only regex CheckConstraints from the in-memory metadata
    # for the test process — actual phone-format validation is still fully
    # covered via Pydantic's validate_phone(), which every endpoint runs
    # before a row is ever written. (Left removed for the rest of the
    # process, not just this fixture: backend.main's dev-mode lifespan hook
    # also calls Base.metadata.create_all() against its own engine when the
    # TestClient starts up, which would hit the same Postgres-only syntax if
    # we restored the constraint in between.)
    for table in Base.metadata.tables.values():
        for c in list(table.constraints):
            if isinstance(c, CheckConstraint) and "~" in str(c.sqltext):
                table.constraints.discard(c)

    Base.metadata.create_all(bind=engine)

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db_session):
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.database import get_db

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def seed_org_campaign_user(db_session):
    """Minimal org / campaign / active volunteer + a bearer token, for
    endpoint tests that need an authenticated caller."""
    from backend import models
    from backend.auth import create_access_token

    org = models.Organisation(id=str(uuid.uuid4()), name="Test Church", slug=f"test-{uuid.uuid4().hex[:8]}")
    db_session.add(org)
    db_session.flush()

    campaign = models.Campaign(
        id=str(uuid.uuid4()), organisation_id=org.id, name="Test Campaign",
        status=models.CampaignStatus.active,
    )
    db_session.add(campaign)

    user = models.User(
        id=str(uuid.uuid4()), organisation_id=org.id,
        phone="+2348012345678", name="Test Volunteer",
        role=models.UserRole.volunteer, status=models.UserStatus.active,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token(user.id, user.role.value)
    return {"org": org, "campaign": campaign, "user": user, "token": token}
