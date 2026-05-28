"""
REACH — Avatar upload via Cloudinary (free: 25 GB storage, 25 GB/month bandwidth).
Avatar arrives pre-cropped to 400×400 from the frontend crop UI.
Backend credentials are never exposed to the client.
"""
import asyncio
import cloudinary
import cloudinary.uploader
from .config import settings

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


async def upload_avatar(user_id: str, data: bytes, content_type: str) -> str | None:
    """
    Upload pre-cropped 400×400 avatar to Cloudinary.
    Returns the secure HTTPS URL, or None on failure.
    Path: reach/avatars/{user_id} — overwrites previous avatar automatically.
    """
    def _upload():
        # P1-1.4: public_id is scoped to user_id — no cross-user overwrite possible
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


async def delete_avatar(user_id: str) -> None:
    """Remove avatar from Cloudinary (call on account deletion)."""
    def _delete():
        cloudinary.uploader.destroy(
            f"reach/avatars/{user_id}", resource_type="image"
        )
    try:
        await asyncio.get_event_loop().run_in_executor(None, _delete)
    except Exception:
        pass
