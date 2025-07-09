# main.py

import os
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import requests
import boto3
# python-dotenv सिर्फ़ लोकल टेस्टिंग के लिए है, Render पर ज़रूरत नहीं
from dotenv import load_dotenv 

# Load environment variables from a .env file if it exists (for local development)
# In Render, these will be provided directly by the platform's environment settings.
load_dotenv()

app = FastAPI()

# Configure CORS (Cross-Origin Resource Sharing)
# This allows your frontend (running on a different domain/port) to make requests to your backend.
# In production, replace "*" with the specific URL(s) of your frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Be specific in production, e.g., "https://your-frontend-app.onrender.com"
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (POST, GET, etc.)
    allow_headers=["*"],  # Allow all headers
)

# --- Environment Variables (Render Secrets) ---
# These should be set in your Render service's Environment settings.
# The `os.getenv()` function reads these values.

REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
WASABI_ACCESS_KEY = os.getenv("WASABI_ACCESS_KEY")
WASABI_SECRET_KEY = os.getenv("WASABI_SECRET_KEY")
WASABI_BUCKET_NAME = os.getenv("WASABI_BUCKET_NAME")
WASABI_REGION = os.getenv("WASABI_REGION") # e.g., 'ap-southeast-1'
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
# Ensure this URL ends WITHOUT a trailing slash, e.g., 'https://shubhzone-cdn.b-cdn.net'
BUNNY_PULL_ZONE_URL = os.getenv("BUNNY_PULL_ZONE_URL") 

# Note: DATABASE_URL aur FIREBASE_SERVICE_ACCOUNT_BASE64 ki zarurat AI interaction mein abhi directly nahi hai,
# par future features (user data, upload history) ke liye lagegi.

# --- Wasabi (S3 Compatible) Client ---
# AI assets (images, video loops) are likely stored on Wasabi.
# This client can be used to verify they exist or fetch metadata if needed (though direct BunnyCDN URL is used for serving).
# It will be essential later for User Media Uploads.
try:
    s3_client = boto3.client(
        's3',
        endpoint_url=f'https://s3.{WASABI_REGION}.wasabisys.com', # Wasabi endpoint URL structure
        aws_access_key_id=WASABI_ACCESS_KEY,
        aws_secret_access_key=WASABI_SECRET_KEY,
        region_name=WASABI_REGION # Specify the region
    )
    # Optional: Test the connection (uncomment for debugging)
    # response = s3_client.list_buckets()
    # print("Connected to Wasabi. Buckets:", [b['Name'] for b in response['Buckets']])
except Exception as e:
    print(f"Warning: Failed to initialize Wasabi S3 client: {e}")
    s3_client = None # Set client to None if connection fails

# --- AI Interaction API Endpoint ---

@app.post("/ai/interact/")
async def ai_interact(audio_file: UploadFile = File(...)):
    """
    Receives user audio, processes it using AI (Transcription, LLM, TTS),
    and returns instructions for the frontend on which AI visual/audio assets to play.
    """
    print("Received request to /ai/interact/")

    if not OPENROUTER_API_KEY and not REPLICATE_API_TOKEN:
         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="AI API keys not configured on the backend.")

    # 1. Receive and Read Audio
    # Read the audio file content sent by the frontend
    try:
        audio_bytes = await audio_file.read()
        print(f"Received audio file: {audio_file.filename}, size: {len(audio_bytes)} bytes")
        # In a real application, you might save this audio temporarily or stream it
        # to the transcription service directly.
    except Exception as e:
        print(f"Error reading audio file: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read audio file: {e}")


    # --- 2. Audio Transcription (Speech-to-Text) ---
    # Convert user's audio (`audio_bytes`) into text (`user_text`).
    # This requires sending the audio to a Speech-to-Text service/model.
    # You can use Replicate, OpenRouter, or another API like OpenAI's Whisper.

    user_text = None # Initialize user_text
    try:
        print("--- Attempting Audio Transcription ---")
        # --- Placeholder Transcription ---
        # REPLACE THIS with actual API call to your chosen STT service.
        # Example using OpenRouter (conceptual - check actual OpenRouter STT docs)
        # OpenRouter might proxy various STT models. Find one compatible.
        # Or use a dedicated STT service like AssemblyAI, Deepgram, or OpenAI's Whisper.

        # Dummy placeholder for testing without an actual STT API call
        # In a real scenario, this would be the result of the API call.
        # For testing, let's simulate a transcription result.
        # You might infer intent or use a simple phrase for testing.
        print("Using placeholder transcription. Replace with actual STT API.")
        
        # --- Example using a hypothetical STT via requests (NOT REAL OPENROUTER STT endpoint) ---
        # stt_url = "https://api.openrouter.ai/api/v1/audio/transcriptions" # Hypothetical endpoint
        # files = {'file': ('audio.wav', audio_bytes, 'audio/wav')} # Adjust filename and content type as needed
        # stt_headers = { "Authorization": f"Bearer {OPENROUTER_API_KEY}" }
        # stt_response = requests.post(stt_url, headers=stt_headers, files=files)
        # stt_response.raise_for_status() # Raise an exception for bad status codes
        # user_text = stt_response.json().get("text") # Adjust key based on API response
        # print(f"Transcription Result (Hypothetical): {user_text}")

        # Fallback or hardcoded for initial testing:
        user_text = "Tell me a short story." # Default test text if no STT API is used yet

        if not user_text:
             raise Exception("Transcription returned empty text.")
        print(f"Transcribed Text: '{user_text}'")

    except Exception as e:
        print(f"Transcription Error: {e}")
        # It's okay to proceed with LLM if transcription fails, maybe use a default prompt
        print("Transcription failed. Proceeding with LLM using a default or empty text.")
        user_text = user_text or "Please repeat that." # Use default if transcription completely failed


    # --- 3. LLM Interaction (Text Generation) ---
    # Send the `user_text` to a Large Language Model to get a text response.
    # Using OpenRouter as it's listed in your secrets. Replicate is another option.

    llm_text_response = None # Initialize LLM response
    try:
        print("--- Sending text to LLM (OpenRouter) ---")
        llm_url = "https://openrouter.ai/api/v1/chat/completions"
        # Choose an appropriate model available on OpenRouter
        # gpt-3.5-turbo is a common choice, but explore others if needed
        llm_payload = {
            "model": "gpt-3.5-turbo", 
            "messages": [
                {"role": "system", "content": "You are an AI friend named Vivan. Be helpful, friendly, and conversational. Keep responses relatively concise for video interaction."},
                {"role": "user", "content": user_text}
            ]
        }
        llm_headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        
        llm_response = requests.post(llm_url, headers=llm_headers, json=llm_payload)
        llm_response.raise_for_status() # Raise an exception for bad status codes
        
        llm_text_response = llm_response.json()["choices"][0]["message"]["content"]
        print(f"LLM Text Response: '{llm_text_response}'")

    except requests.exceptions.RequestException as e:
        print(f"LLM Request Error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"LLM API request failed: {e}")
    except Exception as e:
        print(f"LLM Processing Error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"LLM response processing failed: {e}")

    if not llm_text_response:
         # If LLM somehow returned an empty response
         llm_text_response = "I'm sorry, I couldn't generate a response right now. Please try again."
         print("Warning: LLM returned empty response, using fallback text.")


    # --- 4. Text-to-Speech (TTS) ---
    # Convert the `llm_text_response` into audio.
    # You need a TTS service/model for this. OpenRouter/Replicate may have options.
    # You might use `vivan_voice_sample.mp3` for voice cloning if your TTS service supports it.
    # The output will be audio bytes or a temporary URL.

    tts_audio_url = None # Initialize TTS audio URL
    try:
        print("--- Attempting Text-to-Speech ---")
        # --- Placeholder TTS ---
        # REPLACE THIS with actual API call to your chosen TTS service.
        # Send `llm_text_response` to the TTS API.
        # If the TTS API gives a direct URL, use that.
        # If it gives audio bytes, you might need to upload these bytes to Wasabi
        # and generate a BunnyCDN URL for them.

        # Dummy placeholder URL for testing. THIS FILE MUST EXIST on your Wasabi/BunnyCDN.
        # Ideally, a TTS service would generate unique audio for each response.
        print("Using placeholder TTS audio URL. Replace with actual TTS API.")
        # Example: A short generic "okay" or "processing" audio file URL
        # This needs a path relative to your BunnyCDN pull zone root.
        # Example path: ai_assets/placeholder_response.mp3
        # Ensure you have a folder named 'ai_assets' in your Wasabi bucket
        # and put a dummy audio file there.
        placeholder_audio_path = "ai_assets/placeholder_response.mp3" # ADJUST THIS PATH
        
        if BUNNY_PULL_ZONE_URL:
            tts_audio_url = f"{BUNNY_PULL_ZONE_URL}/{placeholder_audio_path}"
        else:
             print("Warning: BUNNY_PULL_ZONE_URL is not set. Cannot generate TTS audio URL.")


        # --- Example using a hypothetical TTS via requests ---
        # tts_url = "TTS_API_URL" # Replace with actual API endpoint (e.g., OpenRouter TTS, Replicate TTS, OpenAI TTS)
        # tts_payload = {"text": llm_text_response, "voice_id": "some_vivan_voice_id"} # Adjust payload for your TTS service
        # tts_headers = { "Authorization": f"Bearer {TTS_API_KEY}" } # Use appropriate API Key
        # tts_response = requests.post(tts_url, headers=tts_headers, json=tts_payload) # Or data=, or files= depending on API
        # tts_response.raise_for_status()
        
        # # If TTS returns audio bytes directly:
        # tts_audio_bytes = tts_response.content
        # # You would then upload `tts_audio_bytes` to Wasabi and get its BunnyCDN URL
        # print("TTS generated audio bytes (placeholder step). Needs upload to Wasabi.")
        # # Dummy Wasabi Upload & BunnyCDN URL generation (conceptual):
        # # unique_audio_key = f"ai_responses/{uuid.uuid4()}.mp3"
        # # s3_client.put_object(Bucket=WASABI_BUCKET_NAME, Key=unique_audio_key, Body=tts_audio_bytes, ContentType="audio/mpeg")
        # # tts_audio_url = f"{BUNNY_PULL_ZONE_URL}/{unique_audio_key}"
        # # print(f"TTS Audio uploaded to Wasabi. URL: {tts_audio_url}")


    except Exception as e:
        print(f"TTS Error: {e}")
        print("Warning: Text-to-Speech failed. AI will only show visual and text.")
        tts_audio_url = None # Indicate no audio is available


    # --- 5. AI Asset Orchestration / Response Payload ---
    # Based on the result (especially if TTS audio was generated),
    # decide which visual asset (`vivan_idle_image.jpg` or `vivan_talking_loop.mp4`)
    # the frontend should use.
    # These asset files MUST be in your Wasabi bucket under the correct path
    # for the BunnyCDN URL to work.
    # Example path: ai_assets/vivan_idle_image.jpg
    # Example path: ai_assets/vivan_talking_loop.mp4
    
    ai_visual_asset_path = "ai_assets/vivan_idle_image.jpg" # Default visual asset path
    ai_action = "show_image" # Default action

    if tts_audio_url:
        # If TTS was successful, instruct the frontend to play the talking video loop.
        ai_visual_asset_path = "ai_assets/vivan_talking_loop.mp4" # Path to your talking loop video
        ai_action = "play_talking_video_with_audio" # Action indicating video+audio playback

    # Construct the full BunnyCDN URLs
    ai_visual_asset_url = f"{BUNNY_PULL_ZONE_URL}/{ai_visual_asset_path}" if BUNNY_PULL_ZONE_URL else None


    # Prepare the final response payload for the frontend
    response_payload = {
        "status": "success",
        "user_text": user_text, # Show the transcribed text (useful for debugging)
        "ai_text_response": llm_text_response, # The text the AI generated
        "ai_action": ai_action, # Instruction for frontend: "show_image" or "play_talking_video_with_audio"
        "ai_visual_asset_url": ai_visual_asset_url, # URL for the image or video loop
        "ai_audio_url": tts_audio_url # URL for the generated TTS audio
        # Frontend will be responsible for playing the audio and synchronizing the visual based on `ai_action`
        # You might need to add audio duration here if your TTS API provides it, for better sync on frontend.
    }

    print("Sending response to frontend:", response_payload)
    return response_payload

# --- Basic root endpoint (Optional) ---
# This is useful to check if the backend is running by visiting the root URL.
@app.get("/")
async def read_root():
    return {"message": "AI Backend is running successfully!"}

# --- Placeholder for future User Media Upload API ---
# @app.post("/media/upload/")
# async def upload_user_media(file: UploadFile = File(...)):
#     # This function will be implemented later to handle user video/audio uploads to Wasabi.
#     # It will need the s3_client and DATABASE_URL.
#     print("User upload endpoint hit (placeholder).")
#     raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="User media upload is not yet implemented.")

# --- Placeholder for future User Media Listing API ---
# @app.get("/user/media/")
# async def list_user_media():
#     # This function will be implemented later to fetch user's uploaded media from the database.
#     print("List user media endpoint hit (placeholder).")
#     raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="User media listing is not yet implemented.")

# To run locally (for testing):
# Install dependencies: pip install fastapi uvicorn requests boto3 python-dotenv
# Create a .env file with your secrets (optional for Render, needed for local testing)
# Run: uvicorn main:app --reload
# Use a tool like Postman or your frontend to send a POST request to http://127.0.0.1:8000/ai/interact/
# with an audio file in the 'audio_file' form field.
