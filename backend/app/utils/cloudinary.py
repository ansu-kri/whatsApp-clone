import cloudinary
import cloudinary.uploader

from dotenv import load_dotenv
import os

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv("CLOUD_NAME"),
    api_key= os.getenv("CLOUD_API_KEY"),
    api_secret= os.getenv("CLOUD_API_SECRET")
)