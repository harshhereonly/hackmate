"""Avatar processing.

Uploads are decoded and re-encoded rather than stored as-is. That strips EXIF
metadata (including GPS location), drops anything that isn't pixel data, and
gives every avatar a fixed size and format. The result is stored in MongoDB so
it survives redeploys on hosts with ephemeral disks, such as Render.
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import AppError, bad_request

AVATAR_SIZE = 256
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP", "GIF", "MPO"}
_MAX_PIXELS = 40_000_000  # far below Pillow's bomb threshold; real photos fit easily

Image.MAX_IMAGE_PIXELS = _MAX_PIXELS


def process_avatar(raw: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in _ALLOWED_FORMATS:
                raise bad_request("Upload a PNG, JPEG, WebP or GIF image.", code="unsupported_image")
            if source.width * source.height > _MAX_PIXELS:
                raise bad_request("That image is too large. Use one under 40 megapixels.", code="image_too_large")
            source.seek(0)  # first frame of animated images
            oriented = ImageOps.exif_transpose(source)
            has_alpha = oriented.mode in ("RGBA", "LA", "PA") or "transparency" in oriented.info
            converted = oriented.convert("RGBA" if has_alpha else "RGB")
            fitted = ImageOps.fit(converted, (AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            fitted.save(output, format="WEBP", quality=85, method=4)  # no exif= argument -> no metadata
            return output.getvalue()
    except AppError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError):
        raise bad_request("That file isn't a valid image.", code="invalid_image") from None
