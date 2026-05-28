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

@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...)
):
    
    result = cloudinary.uploader.upload(
        file.file,
        resource_type="video"
    )

    return {
        "audioUrl": result["secure_url"]
    }

@router.post("video")
async def upload_video(
    file: UploadFile = File(...)
):
    
    result = cloudinary.uploader.upload(
        file.file,
        resource_type= "video"
    )

    return {
        "videoUrl": result["secure_url"],
    }