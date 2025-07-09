import os
import requests
import boto3
import replicate # <-- Replicate लाइब्रेरी इम्पोर्ट करें
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# .env फ़ाइल लोड करें
load_dotenv()

app = FastAPI()

# Jinja2 टेम्प्लेट्स
templates = Jinja2Templates(directory=".")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# एनवायरनमेंट वेरिएबल्स
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
WASABI_ACCESS_KEY = os.getenv("WASABI_ACCESS_KEY")
WASABI_SECRET_KEY = os.getenv("WASABI_SECRET_KEY")
WASABI_BUCKET_NAME = os.getenv("WASABI_BUCKET_NAME")
WASABI_REGION = os.getenv("WASABI_REGION")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL_NAME = os.getenv("GROQ_MODEL_NAME", "llama3-8b-8192")
BUNNY_PULL_ZONE_URL = os.getenv("BUNNY_PULL_ZONE_URL")

# Wasabi क्लाइंट (यह वैसे ही रहेगा)
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

# रूट पर index.html दिखाएं
@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- AI इंटरेक्शन API (पूरी तरह से अपडेट किया हुआ) ---
@app.post("/ai/interact/")
async def ai_interact(audio_file: UploadFile = File(...)):
    print("Received request to /ai/interact/")

    # API Keys की जांच करें
    if not GROQ_API_KEY or not REPLICATE_API_TOKEN:
        print("ERROR: GROQ_API_KEY or REPLICATE_API_TOKEN is not set.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI Service is not configured: Missing API Key.")
    
    try:
        audio_bytes = await audio_file.read()
    except Exception as e:
        print(f"Error reading audio file: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read audio file.")

    # --- चरण 1: आवाज़ को टेक्स्ट में बदलना (Transcription) - अभी भी प्लेसहोल्डर ---
    # भविष्य में आप यहां Whisper API या Replicate का इस्तेमाल कर सकते हैं
    user_text = "Tell me a short, fun fact about space."
    print(f"Placeholder Transcribed Text: '{user_text}'")

    # --- चरण 2: Groq से टेक्स्ट जवाब पाना (LLM Interaction) ---
    llm_text_response = ""
    try:
        print("--- Sending request to Groq AI ---")
        llm_headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        llm_payload = {
            "model": GROQ_MODEL_NAME,
            "messages": [
                {"role": "system", "content": "You are a friendly AI assistant. Keep your answers brief and engaging."},
                {"role": "user", "content": user_text}
            ]
        }
        llm_url = "https://api.groq.com/openai/v1/chat/completions"
        llm_response = requests.post(llm_url, headers=llm_headers, json=llm_payload)
        llm_response.raise_for_status()
        response_data = llm_response.json()
        llm_text_response = response_data["choices"][0]["message"]["content"]
        print(f"LLM Response Received: '{llm_text_response}'")
    except Exception as e:
        print(f"ERROR during LLM interaction: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get response from LLM.")

    # --- चरण 3: टेक्स्ट को आवाज़ में बदलना (Text-to-Speech using Replicate) ---
    tts_audio_url = None
    try:
        print("--- Sending request to Replicate for TTS ---")
        # हम suno-ai/bark मॉडल का उपयोग कर रहे हैं जो टेक्स्ट से réalistic आवाज़ बनाता है
        # आप चाहें तो elevenlabs/eleven-multilingual-v2 जैसा कोई और मॉडल भी इस्तेमाल कर सकते हैं
        tts_output = replicate.run(
            "suno-ai/bark:b71792ec0e9fc823975d789033324185295486879893540de792fd90175eba25",
            input={
                "prompt": llm_text_response,
                "history_prompt": "announcer" # आवाज़ का प्रकार
            }
        )
        # Replicate से मिला ऑडियो URL
        tts_audio_url = tts_output.get("audio_out")
        print(f"TTS Audio URL from Replicate: {tts_audio_url}")
        
        if not tts_audio_url:
            raise Exception("Replicate did not return an audio URL.")

    except Exception as e:
        print(f"ERROR during TTS interaction: {e}")
        # अगर TTS फेल होता है तो भी हम आगे बढ़ेंगे, लेकिन बिना आवाज़ के
        # आप चाहें तो यहां HTTPException भी रेज़ कर सकते हैं
        tts_audio_url = None # सुनिश्चित करें कि URL None है

    # --- चरण 4: फ्रंटएंड के लिए सही विज़ुअल और एक्शन तय करना ---
    ai_visual_asset_path = ""
    ai_action = ""

    # अगर हमें TTS से ऑडियो URL मिला है, तो बोलने वाला वीडियो चलाएं
    if tts_audio_url:
        # **पाथ फिक्स**: अब हम 'ai_assets' फोल्डर का इस्तेमाल नहीं कर रहे हैं
        ai_visual_asset_path = "vivan_talking_loop.mp4"
        ai_action = "play_talking_video_with_audio"
    else:
        # अगर ऑडियो URL नहीं है, तो सिर्फ आइडल इमेज दिखाएं
        ai_visual_asset_path = "vivan_idle_image.jpg"
        ai_action = "show_image"
        # अगर TTS फेल हुआ तो AI का टेक्स्ट जवाब दिखाएं
        if not llm_text_response:
             llm_text_response = "I'm sorry, I couldn't process that request."
        
    # BunnyCDN के ज़रिए पूरा URL बनाएं
    ai_visual_asset_url = f"{BUNNY_PULL_ZONE_URL}/{ai_visual_asset_path}" if BUNNY_PULL_ZONE_URL else None
    
    # फाइनल पेलोड जो फ्रंटएंड को भेजा जाएगा
    response_payload = {
        "status": "success",
        "ai_text_response": llm_text_response,
        "ai_action": ai_action,
        "ai_visual_asset_url": ai_visual_asset_url, # Wasabi से वीडियो/इमेज का URL
        "ai_audio_url": tts_audio_url # Replicate से मिला डायनामिक ऑडियो URL
    }

    print("Sending final response to frontend:", response_payload)
    return JSONResponse(content=response_payload)

# मीडिया अपलोड वाला एंडपॉइंट (यह वैसे ही रहेगा)
@app.post("/media/upload/")
async def upload_user_media(video_file: UploadFile = File(...), thumbnail_file: UploadFile = File(...)):
    return JSONResponse(status_code=501, content={"detail": "Upload functionality is not implemented yet."})
