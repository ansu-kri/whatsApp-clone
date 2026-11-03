import uuid
from pathlib import Path
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from app.database import db
from app.middleware.authMiddleware import verify_token

router = APIRouter(dependencies=[Depends(verify_token)])
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "private_uploads"

def _detect(data: bytes, declared_type: str):
    if data.startswith(b"\xff\xd8\xff"): return "image/jpeg", ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png", ".png"
    if data.startswith((b"GIF87a", b"GIF89a")): return "image/gif", ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp", ".webp"
    if len(data) >= 12 and data[4:8] == b"ftyp": return ("audio/mp4" if declared_type == "audio/mp4" else "video/mp4"), ".mp4"
    if data.startswith(b"\x1a\x45\xdf\xa3"): return ("audio/webm" if declared_type == "audio/webm" else "video/webm"), ".webm"
    if data.startswith(b"OggS"): return "audio/ogg", ".ogg"
    return None, None

@router.post("")
@router.post("/")
async def upload_media(
    file: UploadFile = File(...),
    purpose: str = Query(default="attachment"),
    payload: dict = Depends(verify_token),
):
    if purpose not in ("attachment", "group-avatar"):
        raise HTTPException(status_code=400, detail="Unsupported upload purpose")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File must be smaller than 25 MB")
    media_type, extension = _detect(content[:16], file.content_type or "")
    if not media_type or file.content_type not in (media_type, "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Unsupported or invalid media file")
    if purpose == "group-avatar":
        if media_type not in ("image/png", "image/jpeg", "image/webp"):
            raise HTTPException(status_code=415, detail="Group images must be PNG, JPG, JPEG, or WEBP")
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Group images must be 5 MB or smaller")
    media_id = uuid.uuid4().hex
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path = UPLOAD_DIR / f"{media_id}{extension}"
    path.write_bytes(content)
    name = Path(file.filename or "media").name[:180]
    await db.uploads.insert_one({"_id": media_id, "ownerId": payload.get("user_id"), "path": str(path), "mediaType": media_type, "fileName": name})
    return {"mediaUrl": f"/api/upload/media/{media_id}", "mediaType": media_type, "fileName": name}

@router.get("/media/{media_id}")
async def get_media(media_id: str, payload: dict = Depends(verify_token)):
    record = await db.uploads.find_one({"_id": media_id})
    if not record: raise HTTPException(status_code=404, detail="Media not found")
    uid = payload.get("user_id")
    url = f"/api/upload/media/{media_id}"
    private = await db.messages.find_one({"attachmentUrl": url, "$or": [{"senderId": uid}, {"receiverId": uid}]})
    group_message = None
    if not private:
        group_message = await db.group_messages.find_one({"attachmentUrl": url})
        if group_message:
            try:
                allowed = await db.groups.find_one({"_id": ObjectId(group_message["groupId"]), "members": uid})
            except Exception:
                allowed = None
            if not allowed:
                group_message = None

    group_avatar = None
    if not private and not group_message:
        group_avatar = await db.groups.find_one({"groupImage": url, "members": uid})

    if not private and not group_message and not group_avatar:
        raise HTTPException(status_code=403, detail="You are not allowed to view this media")
    path = Path(record["path"]).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file(): raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path, media_type=record["mediaType"], filename=record["fileName"], content_disposition_type="inline")
