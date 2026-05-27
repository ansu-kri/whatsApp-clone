from fastapi import APIRouter, UploadFile, File
import cloudinary.uploader

from app.utils.cloudinary import *

router = APIRouter()

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...)
):
    
    result = cloudinary.uploader.upload(
        file.file
    )

    return {
        "imageUrl": result["secure_url"]
    }