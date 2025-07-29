import os
from flask import Flask, request, jsonify, render_template
from twilio.rest import Client
import requests
import config

# IMPORTANT CHANGE: Tell Flask to find templates in the current directory ('.')
app = Flask(__name__, template_folder='.')

# Config se API keys load karna
ACCOUNT_SID = config.TWILIO_ACCOUNT_SID
AUTH_TOKEN = config.TWILIO_AUTH_TOKEN
TWILIO_NUMBER = config.TWILIO_PHONE_NUMBER
ELEVENLABS_API_KEY = config.ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID = config.ELEVENLABS_VOICE_ID
BASE_URL = os.environ.get('RENDER_EXTERNAL_URL') # Render.com se URL automatically le lega

# Audio file save karne ke liye 'static' directory banayega (agar nahi hai)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
os.makedirs(STATIC_DIR, exist_ok=True) # Yeh line folder khud bana degi

AUDIO_FILE_PATH = os.path.join(STATIC_DIR, 'audio.mp3')

# Route 1: Homepage - UI dikhane ke liye
@app.route('/')
def index():
    """Renders the single index.html file."""
    return render_template('index.html')

# Route 2: Voice generate aur call karne ke liye (POST request)
@app.route('/call', methods=['POST'])
def make_call():
    """Pehle voice generate karta hai, fir call initiate karta hai."""
    if not BASE_URL:
        return jsonify({"error": "BASE_URL not configured. Make sure the app is running on Render."}), 500
        
    data = request.get_json()
    if not data or 'text' not in data or 'number' not in data:
        return jsonify({"error": "Text aur number dono zaroori hain"}), 400

    text_to_speak = data['text']
    to_number = data['number']

    # Step 1: ElevenLabs se voice generate karna
    try:
        generate_voice(text_to_speak)
    except Exception as e:
        return jsonify({"error": f"Voice generation failed: {str(e)}"}), 500

    # Step 2: Twilio se call initiate karna
    try:
        # Public URL jahan audio file rakhi hai
        audio_file_url = f"{BASE_URL}/static/audio.mp3"
        
        # Twilio client initialize karna
        client = Client(ACCOUNT_SID, AUTH_TOKEN)
        
        call = client.calls.create(
            to=to_number,
            from_=TWILIO_NUMBER,
            twiml=f'<Response><Play>{audio_file_url}</Play></Response>'
        )
        return jsonify({"message": "Call initiated successfully", "sid": call.sid})
    except Exception as e:
        return jsonify({"error": f"Twilio call failed: {str(e)}"}), 500

def generate_voice(text):
    """ElevenLabs API se audio generate karke static/audio.mp3 me save karta hai."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }
    data = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
    }
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        with open(AUDIO_FILE_PATH, 'wb') as f:
            f.write(response.content)
    else:
        raise Exception(f"ElevenLabs API error: {response.text}")

if __name__ == '__main__':
    # Render port ke liye settings
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)
