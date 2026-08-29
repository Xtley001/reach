"""
REACH — Avatar upload via Supabase Storage.

I-92/93/94: Cloudinary was used for exactly one thing — a pre-cropped
400x400 profile avatar, no video, no on-the-fly transforms beyond
quality:auto/fetch_format:auto. The app already runs on Supabase for
Postgres (see DEPLOY.md), and Supabase Storage (S3-compatible, its own CDN
+ image transforms) is part of the SAME project at no extra signup — so for
a workload this small, a second file-storage vendor was one more API key to
leak and one more dependency for zero real benefit.

I-95: public function signatures (upload_avatar/delete_avatar) kept
identical to the old Cloudinary version so routers/users.py and every other
caller needed no changes at all.

Falls back to Cloudinary automatically if SUPABASE_URL isn't configured but
Cloudinary credentials still are — this is the "swap without breaking
anything mid-migration" path, not a permanent dual-vendor setup. Once
SUPABASE_URL is set, Supabase Storage is used exclusively.
"""
import asyncio
import httpx
from .config import settings

_SUPABASE_CONFIGURED = bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)
_CLOUDINARY_CONFIGURED = bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY)


def _object_path(user_id: str) -> str:
    # I-92: mirrors the old Cloudinary public_id scoping — path is scoped to
    # user_id, so no cross-user overwrite is possible, and re-uploading
    # always replaces the same object rather than accumulating orphans.
    return f"reach/avatars/{user_id}.jpg"


async def _upload_supabase(user_id: str, data: bytes, content_type: str) -> str | None:
    path = _object_path(user_id)
    upload_url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_AVATARS_BUCKET}/{path}"
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": content_type or "image/jpeg",
        # upsert=true == Cloudinary's overwrite=True: re-uploading the same
        # user_id path replaces the previous avatar instead of erroring.
        "x-upsert": "true",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(upload_url, headers=headers, content=data)
        if resp.status_code not in (200, 201):
            print(f"[Supabase Storage error] {resp.status_code} {resp.text}")
            return None
    # Public URL — bucket must be configured public, or this should be
    # swapped for a signed URL if avatars need to stay private.
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_AVATARS_BUCKET}/{path}"


async def _delete_supabase(user_id: str) -> None:
    path = _object_path(user_id)
    delete_url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_AVATARS_BUCKET}/{path}"
    headers = {"Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.delete(delete_url, headers=headers)
    except Exception:
        pass


async def _upload_cloudinary(user_id: str, data: bytes, content_type: str) -> str | None:
    """Rollback path — only used if SUPABASE_URL isn't set. See I-96: revisit
    only if Supabase Storage's free tier ever becomes a real constraint."""
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )

    def _upload():
        result = cloudinary.uploader.upload(
            data,
            public_id=f"reach/avatars/{user_id}",
            overwrite=True,
            resource_type="image",
            transformation=[{"quality": "auto", "fetch_format": "auto"}],
        )
        return result.get("secure_url")

    try:
        return await asyncio.get_event_loop().run_in_executor(None, _upload)
    except Exception as e:
        print(f"[Cloudinary error] {e}")
        return None


async def upload_avatar(user_id: str, data: bytes, content_type: str) -> str | None:
    """
    Upload pre-cropped 400x400 avatar. Returns the public HTTPS URL, or None
    on failure. Prefers Supabase Storage; falls back to Cloudinary only if
    Supabase isn't configured (migration safety net, not a permanent path).
    """
    if _SUPABASE_CONFIGURED:
        return await _upload_supabase(user_id, data, content_type)
    if _CLOUDINARY_CONFIGURED:
        return await _upload_cloudinary(user_id, data, content_type)
    print("[storage] Neither SUPABASE_URL nor Cloudinary credentials are configured — avatar upload skipped.")
    return None


async def delete_avatar(user_id: str) -> None:
    """Remove avatar (call on account deletion)."""
    if _SUPABASE_CONFIGURED:
        await _delete_supabase(user_id)
        return
    if _CLOUDINARY_CONFIGURED:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )

        def _delete():
            cloudinary.uploader.destroy(f"reach/avatars/{user_id}", resource_type="image")

        try:
            await asyncio.get_event_loop().run_in_executor(None, _delete)
        except Exception:
            pass
