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
# --- [बदलाव #1] --- OpenRouter की जगह अब हम Groq की वेरिएबल्स इस्तेमाल करेंगे
# OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") # अब इसकी ज़रूरत नहीं
GROQ_API_KEY = os.getenv("GROQ_API_KEY") # यह आपकी नई Groq API Key होगी
GROQ_MODEL_NAME = os.getenv("GROQ_MODEL_NAME", "llama3-8b-8192") # यह Groq का मॉडल है, डिफ़ॉल्ट llama3 है
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

    # --- [बदलाव #2] --- हम OpenRouter की जगह Groq की key चेक करेंगे
    if not GROQ_API_KEY:
         print("ERROR: GROQ_API_KEY is not set in Render environment variables.")
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
        # --- [बदलाव #3] --- अब हम Groq AI को रिक्वेस्ट भेजेंगे
        print("--- Sending request to Groq AI ---")
        
        # Groq API के लिए सही Headers
        llm_headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json" # Groq के लिए यह हेडर ज़रूरी है
        }
        
        # Groq के लिए सही Payload
        llm_payload = {
            "model": GROQ_MODEL_NAME, # हम Render से मॉडल का नाम लेंगे
            "messages": [
                {"role": "system", "content": "You are a friendly AI assistant. Keep your answers brief and engaging."},
                {"role": "user", "content": user_text}
            ]
        }
        
        # Groq का सही API URL
        llm_url = "https://api.groq.com/openai/v1/chat/completions"
        
        print(f"Requesting LLM with URL: {llm_url}")
        print(f"Requesting LLM with Headers: {llm_headers}")

        llm_response = requests.post(llm_url, headers=llm_headers, json=llm_payload)
        
        # HTTP एरर जैसे 404, 401, आदि को चेक करना
        llm_response.raise_for_status()
        
        response_data = llm_response.json()
        llm_text_response = response_data["choices"][0]["message"]["content"]
        
        print(f"LLM Response Received: '{llm_text_response}'")

    except requests.exceptions.HTTPError as e:
        # यह एरर जैसे 404, 401, 403, आदि को पकड़ेगा
        error_message = f"Failed to get response from AI. Status: {e.response.status_code}. Response: {e.response.text}"
        print(f"ERROR: {error_message}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_message)
    except Exception as e:
        # किसी भी अन्य एरर को पकड़ना
        print(f"ERROR: An unexpected error occurred during LLM interaction: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred.")

    # Placeholder for TTS
    tts_audio_url = f"{BUNNY_PULL_ZONE_URL}/ai_assets/placeholder_response.mp3" if BUNNY_PULL_ZONE_URL else None
    
    # यह वो जगह है जहाँ हम तय करते हैं कि कौन सा Wasabi एसेट दिखाना है
    # अगर AI जवाब देता है, तो बोलने वाला वीडियो दिखाएँ (Wasabi से लड़के का वीडियो)
    ai_visual_asset_path = "ai_assets/vivan_talking_loop.mp4"
    ai_action = "play_talking_video_with_audio"
    
    # अगर किसी कारण ऑडियो फेल हो जाता है, तो आप आइडल इमेज पर वापस जा सकते हैं
    if not tts_audio_url:
        ai_visual_asset_path = "ai_assets/vivan_idle_image.jpg" # Wasabi से लड़के की आइडल इमेज
        ai_action = "show_image"
        
    ai_visual_asset_url = f"{BUNNY_PULL_ZONE_URL}/{ai_visual_asset_path}" if BUNNY_PULL_ZONE_URL else None
    
    # फाइनल पेलोड जो आपके फ्रंटएंड को भेजा जाएगा
    response_payload = {
        "status": "success",
        "ai_text_response": llm_text_response,
        "ai_action": ai_action,
        "ai_visual_asset_url": ai_visual_asset_url, # इसमें Wasabi से लड़के की इमेज/वीडियो का URL होगा
        "ai_audio_url": tts_audio_url
    }

    print("Sending final response to frontend:", response_payload)
    return JSONResponse(content=response_payload)

# Placeholder for media upload
@app.post("/media/upload/")
async def upload_user_media(video_file: UploadFile = File(...), thumbnail_file: UploadFile = File(...)):
    # यह एंडपॉइंट अभी पूरी तरह से लागू नहीं है
    return JSONResponse(status_code=501, content={"detail": "Upload functionality is not implemented yet."})
