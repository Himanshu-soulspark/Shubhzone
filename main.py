# main.py

import os
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import requests
import boto3
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# --- नया कोड: index.html दिखाने के लिए ---
templates = Jinja2Templates(directory=".")

# CORS सेटिंग्स (कोई बदलाव नहीं)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# एनवायरमेंट वेरिएबल्स (कोई बदलाव नहीं)
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
WASABI_ACCESS_KEY = os.getenv("WASABI_ACCESS_KEY")
WASABI_SECRET_KEY = os.getenv("WASABI_SECRET_KEY")
WASABI_BUCKET_NAME = os.getenv("WASABI_BUCKET_NAME")
WASABI_REGION = os.getenv("WASABI_REGION")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
BUNNY_PULL_ZONE_URL = os.getenv("BUNNY_PULL_ZONE_URL")

# Wasabi क्लाइंट (कोई बदलाव नहीं)
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

# --- बदला हुआ कोड: ऐप खुलने पर index.html दिखाओ ---
@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    """
    यह फंक्शन मुख्य index.html फाइल को सर्व करता है।
    """
    return templates.TemplateResponse("index.html", {"request": request})

# --- AI इंटरेक्शन API ---
@app.post("/ai/interact/")
async def ai_interact(audio_file: UploadFile = File(...)):
    print("Received request to /ai/interact/")

    if not OPENROUTER_API_KEY:
         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OpenRouter API key not configured on the backend.")
    
    try:
        audio_bytes = await audio_file.read()
        print(f"Received audio file: {audio_file.filename}, size: {len(audio_bytes)} bytes")
    except Exception as e:
        print(f"Error reading audio file: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read audio file: {e}")
    
    user_text = None
    try:
        print("--- Attempting Audio Transcription (Placeholder) ---")
        user_text = "Tell me a short story about a robot and a child."
        print(f"Transcribed Text: '{user_text}'")
    except Exception as e:
        print(f"Transcription Error: {e}")
        user_text = user_text or "Please repeat that."

    llm_text_response = None
    try:
        print("--- Sending text to LLM (OpenRouter) ---")
        llm_url = "https://openrouter.ai/api/v1/chat/completions"
        llm_payload = {
            "model": "gpt-3.5-turbo", 
            "messages": [
                {"role": "system", "content": "You are an AI friend named Vivan. Be helpful, friendly, and conversational. Keep responses relatively concise for video interaction."},
                {"role": "user", "content": user_text}
            ]
        }
        
        # --- यहाँ बदलाव किया गया है ---
        # OpenRouter को बताने के लिए कि रिक्वेस्ट कहाँ से आ रही है, ये हेडर्स ज़रूरी हैं।
        llm_headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://shubhzone.onrender.com", # <<< यह ज़रूरी लाइन जोड़ी गई
            "X-Title": "Shubhzone AI App" # <<< यह अच्छी प्रैक्टिस है
        }
        # --- बदलाव खत्म ---
        
        llm_response = requests.post(llm_url, headers=llm_headers, json=llm_payload)
        llm_response.raise_for_status() # यह एरर देगा अगर 404 या कोई और प्रॉब्लम हुई
        
        llm_text_response = llm_response.json()["choices"][0]["message"]["content"]
        print(f"LLM Text Response: '{llm_text_response}'")
    except requests.exceptions.HTTPError as e:
        print(f"LLM HTTP Error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"LLM API request failed: {e.response.status_code} Client Error: {e.response.reason} for url: {e.request.url}")
    except Exception as e:
        print(f"LLM Processing Error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"LLM response processing failed: {e}")

    if not llm_text_response:
         llm_text_response = "I'm sorry, I couldn't generate a response right now. Please try again."
         print("Warning: LLM returned empty response, using fallback text.")

    tts_audio_url = None
    try:
        print("--- Attempting Text-to-Speech (Placeholder) ---")
        placeholder_audio_path = "ai_assets/placeholder_response.mp3"
        if BUNNY_PULL_ZONE_URL:
            tts_audio_url = f"{BUNNY_PULL_ZONE_URL}/{placeholder_audio_path}"
        else:
             print("Warning: BUNNY_PULL_ZONE_URL is not set. Cannot generate TTS audio URL.")
    except Exception as e:
        print(f"TTS Error: {e}")
        tts_audio_url = None

    # अब जब AI का जवाब मिल गया है, तो हम तय करेंगे कि Wasabi से कौन सी इमेज दिखानी है।
    ai_visual_asset_path = "ai_assets/vivan_idle_image.jpg"
    ai_action = "show_image"
    if tts_audio_url:
        # अगर ऑडियो है, तो टॉकिंग वीडियो दिखाओ
        ai_visual_asset_path = "ai_assets/vivan_talking_loop.mp4"
        ai_action = "play_talking_video_with_audio"
    
    ai_visual_asset_url = f"{BUNNY_PULL_ZONE_URL}/{ai_visual_asset_path}" if BUNNY_PULL_ZONE_URL else None

    response_payload = {
        "status": "success",
        "user_text": user_text,
        "ai_text_response": llm_text_response,
        "ai_action": ai_action,
        "ai_visual_asset_url": ai_visual_asset_url, # यह है Wasabi/BunnyCDN का URL
        "ai_audio_url": tts_audio_url
    }

    print("Sending response to frontend:", response_payload)
    return response_payload

# --- वीडियो अपलोड API (कोई बदलाव नहीं) ---
@app.post("/media/upload/")
async def upload_user_media(file: UploadFile = File(...)):
    print("User upload endpoint hit (placeholder).")
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="User media upload is not yet implemented.")
