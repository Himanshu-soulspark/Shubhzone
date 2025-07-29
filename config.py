# config.py
import os

# Render ke Environment Variables se keys lene ke liye
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY')

# Voice ID (Ise aap hardcode kar sakte hain ya environment variable mein daal sakte hain)
ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' # Example: Rachel's voice```

#### `requirements.txt`
