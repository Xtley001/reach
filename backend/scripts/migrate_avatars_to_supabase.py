"""
REACH — one-time script: copy existing Cloudinary avatars into Supabase Storage (I-95)

Run once, after setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the
environment, to migrate any users who already have a Cloudinary
avatar_url. New uploads go straight to Supabase automatically (see
storage.py) — this script only backfills history.

Usage:
    cd backend
    python -m scripts.migrate_avatars_to_supabase [--dry-run]

Safe to re-run: re-uploading the same user_id path just overwrites
(x-upsert: true), so a partial/interrupted run can simply be re-run.
"""
import argparse
import asyncio
import sys

import httpx

from ..config import settings
from ..database import SessionLocal
from ..models import User
from ..storage import _object_path, _upload_supabase, _SUPABASE_CONFIGURED


async def migrate(dry_run: bool = False):
    if not _SUPABASE_CONFIGURED:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Nothing to do.")
        sys.exit(1)

    db = SessionLocal()
    try:
        users = db.query(User).filter(
            User.avatar_url.isnot(None),
            User.avatar_url.like("%cloudinary%"),
        ).all()
    finally:
        pass  # keep session open for the update loop below

    print(f"Found {len(users)} user(s) with a Cloudinary avatar_url.")
    if dry_run:
        for u in users:
            print(f"  [dry-run] would migrate {u.id}: {u.avatar_url}")
        db.close()
        return

    migrated, failed = 0, 0
    async with httpx.AsyncClient(timeout=20) as client:
        for u in users:
            try:
                resp = await client.get(u.avatar_url)
                if resp.status_code != 200:
                    print(f"  SKIP {u.id}: could not fetch original ({resp.status_code})")
                    failed += 1
                    continue
                new_url = await _upload_supabase(u.id, resp.content, resp.headers.get("content-type", "image/jpeg"))
                if not new_url:
                    print(f"  SKIP {u.id}: Supabase upload failed")
                    failed += 1
                    continue
                u.avatar_url = new_url
                db.add(u)
                db.commit()
                migrated += 1
                print(f"  OK   {u.id}: {new_url}")
            except Exception as e:
                db.rollback()
                print(f"  ERROR {u.id}: {e}")
                failed += 1

    db.close()
    print(f"\nDone. Migrated {migrated}, failed {failed}, total {len(users)}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(migrate(dry_run=args.dry_run))
