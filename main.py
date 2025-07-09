# main.py

import os
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import requests
import boto3
from dotenv import load_dotenv

# Load .env file for local development
load_dotenv()

app = FastAPI()

# Serve index.html
templates = Jinja2Templates(directory=".")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment Variables
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
WASABI_ACCESS_KEY = os.getenv("WASABI_ACCESS_KEY")
WASABI_SECRET_KEY = os.getenv("WASABI_SECRET_KEY")
WASABI_BUCKET_NAME = os.getenv("WASABI_BUCKET_NAME")
WASABI_REGION = os.getenv("WASABI_REGION")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
BUNNY_PULL_ZONE_URL = os.getenv("BUNNY_PULL_ZONE_URL")

# Wasabi Client
try:
    s3_client = boto3.client(
        's3',
        endpoint_url=f'https://s3.{WASABI_REGION}.wasabisys.com',
        aws_access_key_id=WASABI_ACCESS_KEY,
        aws_secret_access_key=WASABI_SECRET_KEY,
        region_name=WASABI_REGION
    )
except Exception as e:
    print(f"Warning: Failed to initialize Wasabi S3 client: {e}")
    s3_client = None

# Serve index.html at root
@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# AI Interaction API
@app.post("/ai/interact/")
async def ai_interact(audio_file: UploadFile = File(...)):
    print("Received request to /ai/interact/")

    if not OPENROUTER_API_KEY:
         print("ERROR: OPENROUTER_API_KEY is not set in Render environment variables.")
         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI Service is not configured: Missing API Key.")
    
    try:
        audio_bytes = await audio_file.read()
    except Exception as e:
        print(f"Error reading audio file: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read audio file.")
    
    # Placeholder for Transcription
    user_text = "Tell me a short, fun fact about space."
    print(f"Placeholder Transcribed Text: '{user_text}'")

    # LLM Interaction
    try:
        print("--- Sending request to OpenRouter AI ---")
        
        # Correct headers for OpenRouter API
        llm_headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": f"https://{os.getenv('RENDER_EXTERNAL_HOSTNAME', 'shubhzone.onrender.com')}", # Dynamically get Render URL
            "X-Title": "Shubhzone AI App"
        }
        
        llm_payload = {
            "model": "openai/gpt-3.5-turbo", # Use a common and reliable model
            "messages": [
                {"role": "system", "content": "You are a friendly AI assistant. Keep your answers brief and engaging."},
                {"role": "user", "content": user_text}
            ]
        }
        
        # The URL that was causing 404 error
        llm_url = "https://openrouter.ai/api/v1/chat/completions"
        
        print(f"Requesting LLM with URL: {llm_url}")
        print(f"Requesting LLM with Headers: {llm_headers}")

        llm_response = requests.post(llm_url, headers=llm_headers, json=llm_payload)
        
        # Check for HTTP errors like 404, 401, etc.
        llm_response.raise_for_status()
        
        response_data = llm_response.json()
        llm_text_response = response_data["choices"][0]["message"]["content"]
        
        print(f"LLM Response Received: '{llm_text_response}'")

    except requests.exceptions.HTTPError as e:
        # This will catch errors like 404, 401, 403, etc.
        error_message = f"Failed to get response from AI. Status: {e.response.status_code}. Response: {e.response.text}"
        print(f"ERROR: {error_message}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_message)
    except Exception as e:
        # Catch any other errors
        print(f"ERROR: An unexpected error occurred during LLM interaction: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred.")

    # Placeholder for TTS
    tts_audio_url = f"{BUNNY_PULL_ZONE_URL}/ai_assets/placeholder_response.mp3" if BUNNY_PULL_ZONE_URL else None
    
    # This is where the magic happens: deciding which Wasabi asset to show
    # If AI gives a response, show the talking video (the boy's video from Wasabi)
    ai_visual_asset_path = "ai_assets/vivan_talking_loop.mp4"
    ai_action = "play_talking_video_with_audio"
    
    # If for some reason audio fails, you can fall back to idle image
    if not tts_audio_url:
        ai_visual_asset_path = "ai_assets/vivan_idle_image.jpg" # The boy's idle image from Wasabi
        ai_action = "show_image"
        
    ai_visual_asset_url = f"{BUNNY_PULL_ZONE_URL}/{ai_visual_asset_path}" if BUNNY_PULL_ZONE_URL else None
    
    # Final payload to send back to your frontend
    response_payload = {
        "status": "success",
        "ai_text_response": llm_text_response,
        "ai_action": ai_action,
        "ai_visual_asset_url": ai_visual_asset_url, # This will have the URL of the boy's image/video from Wasabi
        "ai_audio_url": tts_audio_url
    }

    print("Sending final response to frontend:", response_payload)
    return JSONResponse(content=response_payload)

# Placeholder for media upload
@app.post("/media/upload/")
async def upload_user_media(video_file: UploadFile = File(...), thumbnail_file: UploadFile = File(...)):
    # This endpoint is not fully implemented yet
    return JSONResponse(status_code=501, content={"detail": "Upload functionality is not implemented yet."})
