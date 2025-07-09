import os
import requests
import boto3
import replicate
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# --- स्टेप 1: सेटअप ---
load_dotenv()
app = FastAPI(title="Shubhzone Debug Tool")
templates = Jinja2Templates(directory=".")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- स्टेप 2: सारे एनवायरनमेंट वेरिएबल्स को लोड करना ---
print("--- [DEBUG] चेकिंग एनवायरनमेंट वेरिएबल्स... ---")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
WASABI_ACCESS_KEY = os.getenv("WASABI_ACCESS_KEY")
WASABI_SECRET_KEY = os.getenv("WASABI_SECRET_KEY")
WASABI_BUCKET_NAME = os.getenv("WASABI_BUCKET_NAME")
WASABI_REGION = os.getenv("WASABI_REGION")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
BUNNY_PULL_ZONE_URL = os.getenv("BUNNY_PULL_ZONE_URL")

# --- स्टेप 3: वेरिएबल्स की जांच और लॉगिंग ---
def log_variable(name, var):
    if var:
        print(f"✅ [DEBUG] '{name}' मिला।")
    else:
        print(f"❌ [DEBUG] एरर: '{name}' नहीं मिला! यह बहुत ज़रूरी है।")

log_variable("REPLICATE_API_TOKEN", REPLICATE_API_TOKEN)
log_variable("WASABI_ACCESS_KEY", WASABI_ACCESS_KEY)
log_variable("WASABI_SECRET_KEY", WASABI_SECRET_KEY)
log_variable("WASABI_BUCKET_NAME", WASABI_BUCKET_NAME)
log_variable("WASABI_REGION", WASABI_REGION)
log_variable("GROQ_API_KEY", GROQ_API_KEY)
log_variable("BUNNY_PULL_ZONE_URL", BUNNY_PULL_ZONE_URL)
print("-" * 40)


# --- स्टेप 4: एक डीबग एंडपॉइंट बनाना जो सब कुछ टेस्ट करेगा ---
@app.get("/debug-all", response_class=JSONResponse)
async def debug_all_services():
    print("\n\n--- [DEBUG] फुल सिस्टम टेस्ट शुरू हो रहा है... ---\n")
    results = {}

    # टेस्ट 1: Wasabi/BunnyCDN इमेज लिंक
    print("--- [DEBUG] टेस्ट 1: BunnyCDN इमेज लिंक की जांच... ---")
    image_url = f"{BUNNY_PULL_ZONE_URL}/vivan_idle_image.jpg"
    print(f"[DEBUG] इमेज URL को टेस्ट किया जा रहा है: {image_url}")
    try:
        response = requests.head(image_url, timeout=10)
        if response.status_code == 200:
            results["bunny_image_test"] = f"✅ सफल: इमेज लिंक काम कर रहा है (Status: {response.status_code})"
            print(results["bunny_image_test"])
        else:
            results["bunny_image_test"] = f"❌ फेल: इमेज लिंक काम नहीं कर रहा (Status: {response.status_code}). Wasabi परमिशन या BunnyCDN cache की समस्या हो सकती है।"
            print(results["bunny_image_test"])
    except Exception as e:
        results["bunny_image_test"] = f"❌ फेल: इमेज URL को कनेक्ट करने में एरर आया: {e}"
        print(results["bunny_image_test"])

    # टेस्ट 2: Wasabi/BunnyCDN वीडियो लिंक
    print("\n--- [DEBUG] टेस्ट 2: BunnyCDN वीडियो लिंक की जांच... ---")
    video_url = f"{BUNNY_PULL_ZONE_URL}/vivan_talking_loop.mp4"
    print(f"[DEBUG] वीडियो URL को टेस्ट किया जा रहा है: {video_url}")
    try:
        response = requests.head(video_url, timeout=10)
        if response.status_code == 200:
            results["bunny_video_test"] = f"✅ सफल: वीडियो लिंक काम कर रहा है (Status: {response.status_code})"
            print(results["bunny_video_test"])
        else:
            results["bunny_video_test"] = f"❌ फेल: वीडियो लिंक काम नहीं कर रहा (Status: {response.status_code}). Wasabi परमिशन या BunnyCDN cache की समस्या हो सकती है।"
            print(results["bunny_video_test"])
    except Exception as e:
        results["bunny_video_test"] = f"❌ फेल: वीडियो URL को कनेक्ट करने में एरर आया: {e}"
        print(results["bunny_video_test"])

    # टेस्ट 3: Groq AI
    print("\n--- [DEBUG] टेस्ट 3: Groq AI API की जांच... ---")
    try:
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
        response = requests.post("https://api.groq.com/openai/v1/models", headers=headers)
        if response.status_code == 200:
            results["groq_test"] = "✅ सफल: Groq API Key सही है।"
            print(results["groq_test"])
        else:
            results["groq_test"] = f"❌ फेल: Groq API Key गलत या इनवैलिड है (Status: {response.status_code})."
            print(results["groq_test"])
    except Exception as e:
        results["groq_test"] = f"❌ फेल: Groq API को कनेक्ट करने में एरर आया: {e}"
        print(results["groq_test"])

    # टेस्ट 4: Replicate AI
    print("\n--- [DEBUG] टेस्ट 4: Replicate AI API की जांच... ---")
    try:
        # Replicate API की जांच के लिए हम एक मॉडल की डिटेल्स मांगेंगे
        client = replicate.Client(api_token=REPLICATE_API_TOKEN)
        model = client.models.get("replicate/hello-world")
        results["replicate_test"] = f"✅ सफल: Replicate API Key सही है। (Hello-world मॉडल मिला)"
        print(results["replicate_test"])
    except Exception as e:
        results["replicate_test"] = f"❌ फेल: Replicate API Key गलत या इनवैलिड है। एरर: {e}"
        print(results["replicate_test"])

    print("\n--- [DEBUG] फुल सिस्टम टेस्ट पूरा हुआ। ---")
    return {"test_results": results}


# --- स्टेप 5: बाकी का कोड वैसे ही रखना ---
@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/ai/interact/")
async def ai_interact(audio_file: UploadFile = File(...)):
    # यह फंक्शन अब सिर्फ एक प्लेसहोल्डर की तरह काम करेगा, असली काम /debug-all से होगा
    print("--- /ai/interact/ को कॉल किया गया, लेकिन असली टेस्टिंग /debug-all पर है ---")
    return JSONResponse(
        status_code=200, 
        content={
            "status": "debug_mode",
            "ai_text_response": "सिस्टम अभी डीबग मोड में है। असली समस्या जानने के लिए Render Logs देखें।",
            "ai_action": "show_image",
            "ai_visual_asset_url": f"{BUNNY_PULL_ZONE_URL}/vivan_idle_image.jpg",
            "ai_audio_url": None
        }
    )

@app.post("/media/upload/")
async def upload_user_media(video_file: UploadFile = File(...), thumbnail_file: UploadFile = File(...)):
    return JSONResponse(status_code=501, content={"detail": "Upload functionality is not implemented in debug mode."})
