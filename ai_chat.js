// File: ai_chat.js
// This file handles all the real-time AI conversation logic, including WebSocket
// message processing, interaction with LLM (OpenRouter) and TTS (Replicate) APIs,
// and conversation state management for each connected client.

// ======== Required Libraries ========
const OpenAI = require('openai'); // Used for OpenRouter API, which is OpenAI-compatible
const Replicate = require('replicate'); // Used for Replicate TTS API

// ======== Module Dependencies (set by index.js) ========
// These will be populated by the `setDependencies` function when the server starts.
let dbFirestore = null;
let firebaseInitialized = false;
let getPresignedUrl = null;

// ======== API Clients Initialization ========
// Initialize clients using environment variables. These keys are sensitive and
// must be stored in your hosting environment (e.g., Render Environment Variables).
const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// ======== In-memory Session Management ========
// Use WeakMap to associate session state with each WebSocket connection (ws).
// When a 'ws' connection is closed, its entry in the WeakMap is automatically garbage collected.
const sessions = new WeakMap();

// Define the collection names for Firestore
const AVATARS_COLLECTION = 'ai_avatars';
const CONVERSATIONS_COLLECTION = 'conversations';

// This function is called from index.js to pass necessary dependencies
function setDependencies(deps) {
    dbFirestore = deps.dbFirestore;
    firebaseInitialized = deps.firebaseInitialized;
    getPresignedUrl = deps.getPresignedUrl;
    console.log("AI Chat Handler dependencies set.");
}

// Function to handle a new message from a client
async function handleMessage(ws, message) {
    let session;
    try {
        // Ensure the session exists for this WebSocket connection
        if (!sessions.has(ws)) {
            // Create a new session if one doesn't exist
            sessions.set(ws, createNewSession());
        }
        session = sessions.get(ws);

        // Parse the incoming JSON message
        const data = JSON.parse(message);
        console.log(`[WS] Received message of type: ${data.type} from client.`);

        // --- Handle Different Message Types ---
        switch (data.type) {
            case 'start_session':
                await handleStartSession(ws, session, data);
                break;
            
            case 'end_of_speech':
                await handleEndOfSpeech(ws, session, data);
                break;

            case 'user_interrupted':
                await handleUserInterruption(ws, session);
                break;
            
            // Add cases for other message types like 'audio_chunk' if you implement server-side STT
            default:
                console.warn(`[WS] Received unknown message type: ${data.type}`);
        }
    } catch (error) {
        console.error("[WS] Error processing WebSocket message:", error);
        // Let the client know an error occurred
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'ai_error', message: 'There was a server error processing your request.' }));
        }
        // Reset the session's processing state if an error occurred
        if (session) {
            session.isProcessing = false;
        }
    }
}

// Function to handle a client disconnecting
function handleClose(ws, code, reason) {
    if (sessions.has(ws)) {
        const session = sessions.get(ws);
        console.log(`[WS] Cleaning up session for disconnected client (Avatar: ${session.avatarId || 'None'}).`);
        // Cancel any ongoing API calls for this session
        cancelOngoingProcesses(session);
        
        // TODO: Save final conversation history to Firestore
        // saveConversationHistory(session.userId, session.avatarId, session.history);

        // Remove the session from the map
        sessions.delete(ws);
    }
}

// Function to handle WebSocket errors
function handleError(ws, error) {
    console.error(`[WS] WebSocket error for a client:`, error);
    // The 'close' event will likely follow, which will trigger cleanup via handleClose.
}


// ======== Session and Message Handling Logic ========

/**
 * Creates a new, empty session state object for a new connection.
 */
function createNewSession() {
    return {
        userId: null,
        avatarId: null,
        avatarData: null, // Will store full avatar details (name, prompt, keys)
        history: [], // Stores conversation [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
        isProcessing: false, // Flag to prevent concurrent processing
        llmAbortController: null, // To cancel OpenRouter call
        replicatePrediction: null, // To cancel Replicate call
    };
}

/**
 * Handles the 'start_session' message from the client.
 * Loads avatar data and prepares the session for conversation.
 * @param {WebSocket} ws - The WebSocket connection object.
 * @param {object} session - The session state object for this connection.
 * @param {object} data - The parsed message data from the client.
 */
async function handleStartSession(ws, session, data) {
    if (!firebaseInitialized || !dbFirestore) {
        throw new Error("Cannot start session: Firebase is not initialized.");
    }
    
    session.userId = data.userId || 'anonymous'; // Assign userId from client message
    session.avatarId = data.avatarId;

    if (!session.avatarId) {
        throw new Error("Cannot start session: avatarId is missing.");
    }
    
    console.log(`[WS] Starting session for User: ${session.userId}, Avatar: ${session.avatarId}`);
    
    // Fetch the avatar's full details from Firestore
    const avatarDoc = await dbFirestore.collection(AVATARS_COLLECTION).doc(session.avatarId).get();
    
    if (!avatarDoc.exists) {
        throw new Error(`Avatar with ID ${session.avatarId} not found in Firestore.`);
    }
    
    session.avatarData = avatarDoc.data();
    console.log(`[WS] Loaded avatar data for: ${session.avatarData.name}`);

    // TODO: Load previous conversation history from Firestore for this user/avatar combo
    // session.history = await loadConversationHistory(session.userId, session.avatarId);
    
    // Signal the frontend that the session is ready
    ws.send(JSON.stringify({ type: 'session_ready' }));
}

/**
 * Handles the 'end_of_speech' message, which triggers the main AI processing pipeline.
 * @param {WebSocket} ws - The WebSocket connection object.
 * @param {object} session - The session state object.
 * @param {object} data - The parsed message data containing the user's full transcribed text.
 */
async function handleEndOfSpeech(ws, session, data) {
    const userText = data.fullText?.trim();

    if (!userText) {
        console.log("[WS] Received empty speech text. Ignoring.");
        return;
    }

    if (session.isProcessing) {
        console.warn("[WS] Received new speech while already processing. Ignoring.");
        return;
    }

    if (!session.avatarData) {
        throw new Error("Cannot process speech: Session not started or avatar data not loaded.");
    }

    session.isProcessing = true;
    ws.send(JSON.stringify({ type: 'ai_thinking' }));

    try {
        // 1. Add user's message to conversation history for this session
        session.history.push({ role: 'user', content: userText });

        // 2. Get AI's text response from LLM (OpenRouter)
        const aiResponseText = await getLlmResponse(session);
        
        // 3. Add AI's response to history
        session.history.push({ role: 'assistant', content: aiResponseText });
        
        // Signal frontend that AI is about to speak
        ws.send(JSON.stringify({ type: 'ai_speaking' }));

        // 4. Convert AI's text response to speech audio (Replicate TTS)
        const audioUrl = await getTextToSpeechAudio(session, aiResponseText);

        // 5. Send the audio URL to the frontend for playback
        ws.send(JSON.stringify({ type: 'ai_audio_url', url: audioUrl }));
        // Note: The frontend will send 'ai_finished_speaking' to itself after the audio plays.
        // Or the server can send it after a delay, but client-side is more accurate.
        // We will send it from here for simplicity.
        ws.send(JSON.stringify({ type: 'ai_finished_speaking' }));

    } catch (error) {
        console.error("[AI Pipeline] Error:", error);
        if (error.name !== 'AbortError') { // Don't send error message if it was a user interruption
            ws.send(JSON.stringify({ type: 'ai_error', message: "Sorry, I couldn't process that." }));
            ws.send(JSON.stringify({ type: 'ai_finished_speaking' }));
        }
    } finally {
        // Reset processing state
        session.isProcessing = false;
        session.llmAbortController = null;
        session.replicatePrediction = null;
    }
}

/**
 * Handles the 'user_interrupted' message from the client.
 * @param {WebSocket} ws - The WebSocket connection object.
 * @param {object} session - The session state object.
 */
async function handleUserInterruption(ws, session) {
    console.log("[WS] User interruption detected. Cancelling ongoing AI processes.");
    cancelOngoingProcesses(session);
    session.isProcessing = false; // Immediately allow new input to be processed
    ws.send(JSON.stringify({ type: 'ai_finished_speaking' })); // Signal frontend is ready for new input
}


// ======== AI Service Interaction Functions ========

/**
 * Calls the OpenRouter LLM API to get a text response.
 * @param {object} session - The current session state.
 * @returns {Promise<string>} - A promise that resolves to the AI's text response.
 */
async function getLlmResponse(session) {
    // AbortController allows us to cancel the API request if the user interrupts.
    session.llmAbortController = new AbortController();

    // Prepare messages for the LLM, including the system prompt and conversation history
    const messages = [
        { role: 'system', content: session.avatarData.personalityPrompt },
        ...session.history.slice(-10) // Use the last 10 messages to keep context within token limits
    ];
    
    console.log(`[LLM] Calling OpenRouter with model: mistralai/mistral-7b-instruct`);

    const completion = await openrouter.chat.completions.create({
        model: "mistralai/mistral-7b-instruct", // A good, fast, and cost-effective model
        messages: messages,
        stream: false, // For simplicity, we get the full response. Streaming can be implemented for faster TTS start.
    }, { signal: session.llmAbortController.signal });

    const responseText = completion.choices[0].message.content;
    console.log(`[LLM] Received response: "${responseText.substring(0, 100)}..."`);
    return responseText;
}

/**
 * Calls the Replicate XTTS-v2 API to convert text to speech.
 * @param {object} session - The current session state.
 * @param {string} text - The text to be converted to speech.
 * @returns {Promise<string>} - A promise that resolves to the URL of the generated audio file.
 */
async function getTextToSpeechAudio(session, text) {
    if (!getPresignedUrl) {
        throw new Error("getPresignedUrl function is not available.");
    }
    
    // Get a temporary, secure URL for the voice sample stored in Wasabi.
    const voiceSampleUrl = await getPresignedUrl(session.avatarData.voice_sample_key);
    
    if (!voiceSampleUrl) {
        throw new Error(`Could not get presigned URL for voice sample key: ${session.avatarData.voice_sample_key}`);
    }

    console.log(`[TTS] Calling Replicate XTTS-v2 with language 'hi'`);
    
    const input = {
        text: text,
        speaker_wav: voiceSampleUrl,
        language: "hi" // Specify Hindi as the language
    };
    
    // Create a prediction and store it in the session so it can be cancelled.
    session.replicatePrediction = await replicate.predictions.create({
        // Model version for XTTS-v2
        version: "4b1bf2f3c1c929c64cb59b3b24fc21c5893aa84463a3e6033ad887c636b886a6",
        input: input
    });
    
    // Wait for the prediction to complete
    session.replicatePrediction = await replicate.wait(session.replicatePrediction);

    if (session.replicatePrediction.status === 'succeeded') {
        console.log(`[TTS] Replicate prediction succeeded. Audio URL: ${session.replicatePrediction.output}`);
        return session.replicatePrediction.output; // The URL to the generated MP3 file
    } else {
        throw new Error(`Replicate prediction failed: ${session.replicatePrediction.status} - ${JSON.stringify(session.replicatePrediction.error)}`);
    }
}


// ======== Utility Functions ========

/**
 * Cancels any ongoing LLM or TTS API calls for a given session.
 * @param {object} session - The session state object.
 */
function cancelOngoingProcesses(session) {
    // Cancel OpenRouter (LLM) call if in progress
    if (session.llmAbortController) {
        console.log("[Cancel] Aborting OpenRouter LLM call.");
        session.llmAbortController.abort();
        session.llmAbortController = null;
    }

    // Cancel Replicate (TTS) call if in progress
    if (session.replicatePrediction && session.replicatePrediction.id) {
        console.log(`[Cancel] Cancelling Replicate prediction: ${session.replicatePrediction.id}`);
        // Replicate's API has a specific method for cancellation.
        replicate.predictions.cancel(session.replicatePrediction.id).catch(err => {
            console.error(`[Cancel] Error cancelling Replicate prediction:`, err);
        });
        session.replicatePrediction = null;
    }
}


// ======== Firestore Conversation History (Placeholders) ========
// These functions need to be fully implemented based on your Firestore data structure design.

async function saveConversationHistory(userId, avatarId, history) {
    // TODO: Implement logic to save the `history` array to Firestore.
    // Consider creating a new document for each session or appending to an existing document.
    // Example: dbFirestore.collection(CONVERSATIONS_COLLECTION).add({ userId, avatarId, history, timestamp: new Date() });
    console.log(`[DB] Placeholder: Would save conversation history for user ${userId}, avatar ${avatarId}.`);
}

async function loadConversationHistory(userId, avatarId) {
    // TODO: Implement logic to load conversation history from Firestore.
    // Query based on userId and avatarId, order by timestamp, and return the `history` array.
    console.log(`[DB] Placeholder: Would load conversation history for user ${userId}, avatar ${avatarId}.`);
    return []; // Return empty array for now
}


// Export the main handler functions and the dependency setter
module.exports = {
    setDependencies,
    handleMessage,
    handleClose,
    handleError
};
