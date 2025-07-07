// File: index.js (Complete Backend for Video App + AI Avatar Data & WebSocket Framework)

// ======== Required Libraries ========
const express = require('express'); // For handling HTTP requests (API routes)
const cors = require('cors'); // For allowing cross-origin requests from frontend
const path = require('path'); // For handling file paths (serving index.html)
const { Server } = require('ws'); // WebSocket server library (for real-time AI chat)
const admin = require('firebase-admin'); // Firebase Admin SDK (for Firestore)
const { getPresignedUrl, generateUploadUrl } = require('./wasabi.js'); // Existing functions for Wasabi interaction
const { pool, initializeDatabase } = require('./db.js'); // Existing functions for PostgreSQL DB interaction

// dotenv configuration (Load environment variables from .env file in local development)
// This line should be near the top. In production (like Render), variables are loaded by the environment.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express(); // Initialize Express app
const PORT = process.env.PORT || 3001; // Define the port the server will listen on

// ======== Firebase Initialization ========
// Initialize the Firebase Admin SDK using the service account key stored in Environment Variables.
// This is necessary to interact with Firebase services like Firestore from the backend.
let dbFirestore; // Variable to hold the initialized Firestore instance

try {
    // Get the Base64 encoded service account key from environment variables
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (!serviceAccountBase64) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
    }

    // Decode the Base64 string back into a JSON string
    const serviceAccountJsonString = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');

    // Parse the JSON string into a JavaScript object
    const serviceAccount = JSON.parse(serviceAccountJsonString);

    // Initialize Firebase Admin SDK
    // The databaseURL is often not needed for Firestore, but include if you use other Firebase services or want to be explicit.
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // databaseURL: process.env.DATABASE_URL_FIREBASE // Optional: Add if using RTDB or need explicit URL
    });

    // Get the Firestore database instance
    dbFirestore = admin.firestore();
    console.log('Firebase Admin SDK and Firestore initialized successfully.');

} catch (error) {
    // Log a critical error if Firebase initialization fails
    console.error('FATAL ERROR: Failed to initialize Firebase Admin SDK:', error);
    console.error('Please ensure FIREBASE_SERVICE_ACCOUNT_BASE64 is set correctly in Render Environment Variables and is a valid Base64 encoded JSON string.');
    // We might choose to exit the process here because Firebase is essential for AI avatars.
    // process.exit(1); // Uncomment this line if you want the server to stop if Firebase fails
    // For now, we will allow the server to start but Firestore operations will likely fail.
}


// ======== Middleware ========
// These are functions that run for every incoming request.
app.use(cors()); // Enable CORS for all origins by default (useful for development)
app.use(express.json()); // Parse incoming requests with JSON payloads
// Serve static files (like index.html, CSS, frontend JavaScript) from the directory where index.js is located.
app.use(express.static(path.join(__dirname, '/')));


// ======== Existing Video App API Routes ========
// These routes handle the functionality for your video playlists and user uploads using PostgreSQL and Wasabi.

// --- Generic Upload URL Generator (Used by both Video and AI Asset Uploads) ---
// Endpoint for the frontend to request a pre-signed URL to upload a file directly to Wasabi.
app.get('/api/generate-upload-url', async (req, res) => {
  try {
    const { fileName, contentType } = req.query;
    // Validate required query parameters
    if (!fileName || !contentType) {
      return res.status(400).json({ success: false, message: 'Query parameters "fileName" and "contentType" are required.' });
    }
    // Use the existing generateUploadUrl function from wasabi.js
    const { uploadUrl, key } = await generateUploadUrl(fileName, contentType);
    // Send the generated URL and the file key back to the frontend
    res.status(200).json({ success: true, uploadUrl, key });
  } catch (err) {
    console.error("Error in /api/generate-upload-url:", err);
    // Send an error response with details
    res.status(500).json({ success: false, message: 'Could not get upload URL.', error: err.message });
  }
});

// --- Playlist Endpoints ---

// POST /api/playlists - Endpoint to create a new playlist in PostgreSQL.
app.post('/api/playlists', async (req, res) => {
  const { name, thumbnail_key } = req.body;
  // Validate required request body parameters
  if (!name || !thumbnail_key) {
    return res.status(400).json({ success: false, message: 'Request body must contain "name" and "thumbnail_key".' });
  }
  try {
    // SQL query to insert a new row into the 'playlists' table
    const insertQuery = `INSERT INTO playlists (name, thumbnail_key) VALUES ($1, $2) RETURNING *;`;
    // Execute the query using the PostgreSQL pool
    const result = await pool.query(insertQuery, [name, thumbnail_key]);
    // Send the newly created playlist data back
    res.status(201).json({ success: true, playlist: result.rows[0] });
  } catch (err) {
    console.error("Error creating playlist:", err);
    // Send an error response
    res.status(500).json({ success: false, message: 'Failed to create playlist.', error: err.message });
  }
});

// GET /api/playlists - Endpoint to get a list of all playlists from PostgreSQL.
app.get('/api/playlists', async (req, res) => {
  try {
    // SQL query to select id and name from the 'playlists' table, ordered by name
    const result = await pool.query('SELECT id, name FROM playlists ORDER BY name ASC');
    // Send the list of playlists
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching playlists:", err);
    // Send an error response
    res.status(500).json({ success: false, message: 'Failed to fetch playlists.', error: err.message });
  }
});

// --- Video Endpoints ---

// POST /api/videos - Endpoint to save new video metadata (after files are uploaded to Wasabi) to PostgreSQL.
app.post('/api/videos', async (req, res) => {
  const { title, video_key, thumbnail_key, playlist_id, age_restriction } = req.body;
  // Parse playlist_id to an integer and validate it
  const playlistIdInt = parseInt(playlist_id, 10);

  // Validate required request body parameters
  if (!title || !video_key || !thumbnail_key || isNaN(playlistIdInt)) {
    return res.status(400).json({ success: false, message: 'Request body must contain "title", "video_key", "thumbnail_key", and a valid numeric "playlist_id".' });
  }
  try {
    // SQL query to insert a new row into the 'videos' table
    const insertQuery = `
      INSERT INTO videos (title, video_key, thumbnail_key, playlist_id, age_restriction)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    // Values for the query (use provided age_restriction or default to 'all')
    const values = [title, video_key, thumbnail_key, playlistIdInt, age_restriction || 'all'];
    const result = await pool.query(insertQuery, values);
    // Send the newly created video data back
    res.status(201).json({ success: true, video: result.rows[0] });
  } catch (err) {
    console.error('Error saving video details:', err);
     // Check if the error is a unique constraint violation (e.g., video_key already exists)
     if (err.code === '23505') { // PostgreSQL unique_violation error code
        return res.status(409).json({ success: false, message: 'Video with this key already exists. Please upload a different video or contact support.' });
     }
    // Send a generic error response for other errors
    res.status(500).json({ success: false, message: 'Failed to save video details.', error: err.message });
  }
});

// GET /api/videos/:key/play - Endpoint to get a secure, temporary playback URL for a video from Wasabi.
app.get('/api/videos/:key/play', async (req, res) => {
  try {
    const { key } = req.params; // Get the video key from the URL path
     // Validate required parameter
     if (!key) {
         return res.status(400).json({ success: false, message: 'Video key is required in the URL path.' });
     }
    // Use the existing getPresignedUrl function from wasabi.js
    const signedUrl = await getPresignedUrl(key);
    // Send the generated pre-signed URL back
    res.status(200).json({ success: true, url: signedUrl });
  } catch (err) {
    console.error("Error getting video playback URL:", err);
    // Send an error response
    res.status(500).json({ success: false, message: "Could not get video URL.", error: err.message });
  }
});

// --- Home Page Data Endpoint ---
// Fetches playlists and videos metadata from PostgreSQL, and generates pre-signed URLs for their thumbnails.
app.get('/api/home-content', async (req, res) => {
  try {
    // Step 1: Fetch playlists and videos metadata from the PostgreSQL database simultaneously
    const playlistsQuery = `SELECT id, name, thumbnail_key FROM playlists ORDER BY created_at DESC;`;
    const videosQuery = `SELECT id, title, thumbnail_key AS video_thumbnail_key, playlist_id, video_key FROM videos ORDER BY created_at DESC;`;

    const [playlistsResult, videosResult] = await Promise.all([
        pool.query(playlistsQuery),
        pool.query(videosQuery)
    ]);

    // Step 2: Helper function to generate a secure pre-signed URL while handling potential errors
    const getSafePresignedUrl = async (key) => {
        // Return null immediately if the key is missing
        if (!key) {
            return null;
        }
        try {
            // Use the existing getPresignedUrl function
            const url = await getPresignedUrl(key);
            return url;
        } catch (urlError) {
            // Log the error but return null, allowing the process to continue
            console.error(`Could not generate presigned URL for key: ${key}. Error: ${urlError.message}`);
            return null;
        }
    };

    // Step 3: Generate secure URLs for all playlist and video thumbnails
    // Use Promise.all with .map to asynchronously generate URLs for all items
    const playlistsWithUrls = (await Promise.all(
        playlistsResult.rows.map(async (playlist) => {
            const thumbnailUrl = await getSafePresignedUrl(playlist.thumbnail_key);
            // Include the playlist data along with the generated URL. Filter out if URL failed.
            return thumbnailUrl ? { ...playlist, thumbnailUrl } : null;
        })
    )).filter(p => p !== null); // Filter out any playlist objects where thumbnail URL generation failed

    const videosWithUrls = (await Promise.all(
        videosResult.rows.map(async (video) => {
            const thumbnailUrl = await getSafePresignedUrl(video.video_thumbnail_key);
             // Include video data. If thumbnail URL failed, use a default placeholder or null.
             // The frontend should be able to handle a null thumbnailUrl gracefully (e.g., show a default image).
             return { ...video, thumbnailUrl: thumbnailUrl }; // Return null if URL failed
        })
    )); // Do not filter videos based on thumbnail failure here; let frontend handle display


    // Step 4: Send the aggregated results back to the frontend
    res.status(200).json({
        success: true,
        playlists: playlistsWithUrls, // List of playlists with their thumbnail URLs
        videos: videosWithUrls // List of videos with their thumbnail URLs
    });

  } catch (dbError) {
    // Handle any errors during database query or URL generation
    console.error("Critical error fetching data from Database for home content:", dbError);
    res.status(500).json({ success: false, message: 'Failed to fetch home content due to a server database error.', error: dbError.message });
  }
});


// ======== New AI Avatar API Routes (Using Firebase Firestore) ========
// These routes handle saving and fetching AI avatar metadata using Firebase Firestore.

// Define the collection name for AI avatars in Firestore
const AVATARS_COLLECTION = 'ai_avatars';
// Define the collection name for conversation history
const CONVERSATIONS_COLLECTION = 'conversations';


// POST /api/avatars - Endpoint to save a new AI avatar's metadata to Firestore.
// Used by the development upload form on the frontend.
app.post('/api/avatars', async (req, res) => {
    // Check if Firestore was successfully initialized
    if (!dbFirestore) {
        console.error("Firestore not initialized. Cannot save avatar.");
        return res.status(500).json({ success: false, message: 'Database not available. Firebase initialization failed on the server.' });
    }

    // Extract avatar metadata from the request body
    const { name, personalityPrompt, image_key, video_key } = req.body;

    // Perform basic validation of required fields
    if (!name || !personalityPrompt || !image_key || !video_key) {
        return res.status(400).json({ success: false, message: 'Request body must contain "name", "personalityPrompt", "image_key", and "video_key".' });
    }

    try {
        // Get a reference to the Firestore collection
        const avatarsCollectionRef = dbFirestore.collection(AVATARS_COLLECTION);

        // Create a new document reference with an auto-generated ID
        const newAvatarRef = avatarsCollectionRef.doc();

        // Prepare the data object to be saved
        const avatarData = {
            id: newAvatarRef.id, // Store the auto-generated document ID within the document
            name: name,
            personalityPrompt: personalityPrompt,
            image_key: image_key, // Wasabi key for the image asset
            video_key: video_key, // Wasabi key for the main video loop (talking/idle/etc.)
            created_at: admin.firestore.FieldValue.serverTimestamp() // Add a server-side timestamp for creation time
            // You can add more fields here later, like voiceSampleKey, other video_keys (idle, listening), etc.
        };

        // Save the data to Firestore
        await newAvatarRef.set(avatarData);

        console.log(`New AI Avatar saved to Firestore with ID: ${newAvatarRef.id}`);

        // Send a success response back to the frontend
        res.status(201).json({
            success: true,
            message: 'AI Avatar saved successfully!',
            avatar: { id: avatarData.id, name: avatarData.name } // Return basic info of the saved avatar
        });

    } catch (error) {
        // Handle any errors during the Firestore save operation
        console.error('Error saving AI Avatar to Firestore:', error);
        res.status(500).json({ success: false, message: 'Failed to save AI Avatar.', error: error.message });
    }
});


// GET /api/avatars - Endpoint to get all AI avatars from Firestore, including pre-signed URLs for assets.
// Used by the frontend Package page to display the list of avatars.
app.get('/api/avatars', async (req, res) => {
    // Check if Firestore was successfully initialized
    if (!dbFirestore) {
        console.error("Firestore not initialized. Cannot fetch avatars.");
        return res.status(500).json({ success: false, message: 'Database not available. Firebase initialization failed on the server.' });
    }

    try {
        // Get a reference to the Firestore collection and order by creation time
        const avatarsCollectionRef = dbFirestore.collection(AVATARS_COLLECTION);
        const snapshot = await avatarsCollectionRef.orderBy('created_at', 'asc').get(); // Fetch all documents

        // Check if the collection is empty
        if (snapshot.empty) {
            console.log("No AI avatars found in Firestore.");
            return res.status(200).json({ success: true, avatars: [], message: 'No AI avatars found.' });
        }

        // Process each avatar document to prepare data for the frontend
        // Use Promise.all since getPresignedUrl is asynchronous
        const avatars = await Promise.all(snapshot.docs.map(async doc => {
            const avatarData = doc.data(); // Get the data from the document

            // Generate pre-signed URLs for the image and video assets using Wasabi function
            // Handle potential errors during URL generation gracefully by returning null
            const imageUrl = avatarData.image_key ? await getPresignedUrl(avatarData.image_key).catch(err => {
                 console.error(`Failed to get presigned URL for avatar image key ${avatarData.image_key}: ${err.message}`);
                 return null; // Return null URL on error
            }) : null; // Return null if image_key is missing

             const videoUrl = avatarData.video_key ? await getPresignedUrl(avatarData.video_key).catch(err => {
                 console.error(`Failed to get presigned URL for avatar video key ${avatarData.video_key}: ${err.message}`);
                 return null; // Return null URL on error
            }) : null; // Return null if video_key is missing


            // Return a structured object for the frontend
            return {
                id: avatarData.id, // Document ID
                name: avatarData.name,
                personalityPrompt: avatarData.personalityPrompt,
                image_key: avatarData.image_key, // Optionally include keys
                video_key: avatarData.video_key,
                imageUrl: imageUrl, // The generated URL for the image (or null)
                videoUrl: videoUrl // The generated URL for the video (or null)
                // You would add other asset URLs here as you add them (idle_loop_url, talking_loop_url, etc.)
            };
        }));

        // Send the list of processed avatars (with URLs) back to the frontend
        console.log(`Fetched ${avatars.length} AI avatars from Firestore.`);
        res.status(200).json({ success: true, avatars: avatars });

    } catch (error) {
        // Handle any errors during Firestore query or URL generation
        console.error('Error fetching AI Avatars from Firestore:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch AI Avatars.', error: error.message });
    }
});


// ======== Serve Frontend HTML ========
// This route catches all other GET requests that didn't match the API routes above.
// It serves the index.html file, allowing your frontend routing to take over.
// Place this route AFTER all your /api routes.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// ======== AI Avatar Real-time Conversation (WebSocket Framework) ========
// This section sets up the WebSocket server and the framework for real-time AI interaction.
// The WebSocket server needs to run on the same HTTP server instance as the Express app.

// Create an HTTP server instance and have the Express app handle requests on it.
// This replaces the simple `app.listen(PORT, ...)` if you were using that before.
const server = app.listen(PORT, () => {
  console.log(`HTTP Server is running on port ${PORT}`);
});

// Create a WebSocket server instance and attach it to the HTTP server.
const wss = new Server({ server });

console.log(`WebSocket Server started on port ${PORT}`);


// --- WebSocket Connection Handling ---
// This event fires whenever a new client connects to the WebSocket server.
wss.on('connection', (ws) => {
    console.log('New client connected to WebSocket.');

    // === State specific to THIS connection ===
    // Each user's conversation state should be kept separate.
    let currentConversationHistory = []; // Array to store conversation text for this session [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
    let isProcessing = false; // Flag to indicate if the server is currently processing a user's speech (LLM/TTS)
    let llmCallInProgress = null; // Placeholder to store reference to an ongoing LLM call (for potential cancellation on interruption)
    let ttsCallInProgress = null; // Placeholder to store reference to an ongoing TTS call (for potential cancellation)
    let currentUserId = 'anonymous'; // Default user ID; replace with real authentication later
    let currentAvatarId = null; // ID of the AI avatar the user is currently talking to


    // === Message Handling from THIS client ===
    // This event fires when a message is received from this specific client.
    ws.on('message', async (message) => {
        try {
            // Parse the incoming message (assuming it's JSON stringified)
            const data = JSON.parse(message);
            console.log('Received message from client:', data.type);

            // --- Handle Different Message Types from Frontend ---

            if (data.type === 'start_session') {
                 // Client signals the start of a new conversation session.
                 // This happens when the user selects an avatar and starts the chat.
                 currentUserId = data.userId || 'anonymous'; // Set the user ID for this session
                 currentAvatarId = data.avatarId; // Set the avatar ID for this session
                 console.log(`Conversation session started for user: ${currentUserId}, avatar: ${currentAvatarId}.`);

                 // --- Load Conversation History ---
                 // TODO: Implement logic to load previous conversation history from Firebase Firestore
                 // Query the CONVERSATIONS_COLLECTION for messages/sessions related to this currentUserId and currentAvatarId.
                 // Filter history to include only messages within the last 1 day (as per your requirement).
                 // Format the loaded history into an array like [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }].
                 // Store the loaded history in the `currentConversationHistory` variable for this connection.
                 // Example placeholder:
                 // currentConversationHistory = await loadConversationHistory(currentUserId, currentAvatarId, { duration: '1d' }); // Need to implement loadConversationHistory

                 console.log("Loaded initial conversation history (placeholder logic).");

                 // Send a confirmation back to the frontend that the session is ready
                 ws.send(JSON.stringify({ type: 'session_ready' }));

            } else if (data.type === 'audio_text_chunk') {
                // Received a chunk of transcribed text from the browser's Speech API.
                // data.text will contain the partial or final text.
                const textChunk = data.text;
                // console.log('Received text chunk:', textChunk); // Uncomment for verbose logging of chunks

                // --- Process Text Chunks (Optional for simple loop, important for showing text) ---
                // If you want to show the user's text appearing as they speak on the frontend,
                // you would process these chunks here and potentially send them back to the client
                // or update a state variable for the full text.
                // For the core listen->process->speak loop, we primarily need the `end_of_speech` event with full text.

            } else if (data.type === 'end_of_speech') {
                // User finished speaking (detected by silence from the browser's Speech API).
                // data.fullText should contain the complete transcribed text for this utterance.
                const fullText = data.fullText;
                console.log('End of speech detected. Full text:', fullText);

                // Ignore empty or whitespace-only input
                if (!fullText || fullText.trim() === '') {
                    console.log("Received empty speech, ignoring.");
                     // Send a signal back to frontend to indicate processing is done (even though nothing happened)
                     ws.send(JSON.stringify({ type: 'ai_finished_speaking' }));
                    return; // Stop processing this message
                }

                // Prevent processing new speech if the server is already busy
                if (isProcessing) {
                    console.warn("Received new speech before previous processing finished. Ignoring this input.");
                     // Send a signal back to frontend to indicate readiness for next input
                     ws.send(JSON.stringify({ type: 'ai_finished_speaking' }));
                    return; // Stop processing this message
                }

                // Set the processing flag
                isProcessing = true;
                console.log("Starting AI processing for user input.");

                // Signal the frontend that the AI is thinking
                ws.send(JSON.stringify({ type: 'ai_thinking' }));

                // ======== AI Processing Pipeline (Core Logic - NEEDS IMPLEMENTATION) ========
                // This is the heart of the AI conversation. You need to fill in the details here.

                try {
                    // 1. Get AI Avatar's Personality Prompt and other details (e.g., voice sample key)
                    // Load the selected avatar's full data from Firestore based on the `currentAvatarId` set in `start_session`.
                    // This requires a Firestore query by document ID.
                    if (!dbFirestore || !currentAvatarId) {
                         throw new Error("Firestore not available or no avatar selected for this session.");
                    }
                    const avatarDoc = await dbFirestore.collection(AVATARS_COLLECTION).doc(currentAvatarId).get();

                    if (!avatarDoc.exists) {
                         throw new Error(`AI Avatar with ID "${currentAvatarId}" not found in the database.`);
                    }
                    const avatarData = avatarDoc.data();
                    const personalityPrompt = avatarData.personalityPrompt; // Get the personality prompt text
                    // You might also need avatarData.voiceSampleKey or a direct URL if you stored it.

                    // 2. Format Conversation History for the LLM
                    // Add the user's current input to the history array for this session.
                    currentConversationHistory.push({ role: 'user', content: fullText });

                    // Prepare the messages array in the format required by the LLM API (OpenRouter).
                    // This typically includes:
                    // - A 'system' message containing the `personalityPrompt`.
                    // - Previous messages from `currentConversationHistory` (alternating 'user' and 'assistant' roles).
                    // - The current user message.
                    // It's crucial to manage the history size to stay within the LLM's token limit.
                    // You might slice the `currentConversationHistory` array to get only the most recent N messages.

                    const messagesForLlm = [
                        { role: 'system', content: personalityPrompt },
                        // TODO: Add recent conversation history here from `currentConversationHistory`.
                        // Example: ...currentConversationHistory.slice(-10), // Get the last 10 messages (adjust as needed for token limits)
                        { role: 'user', content: fullText } // Add the current user message
                    ];
                     console.log("Prepared messages for LLM API:", messagesForLlm);


                    // 3. Call OpenRouter LLM API to get AI's text response
                    // Use a suitable Node.js library for OpenRouter (like the official OpenAI library pointed to OpenRouter).
                    // Request a streaming response (`stream: true`) so you get the text word by word or token by token.
                    // This allows you to start TTS as soon as the first text arrives.

                     // TODO: Add OpenRouter API call implementation here.
                     // Example using OpenAI SDK (configured for OpenRouter):
                    // import OpenAI from 'openai'; // Need to require/import if using SDK
                    // const openai = new OpenAI({
                    //     baseURL: "https://openrouter.ai/api/v1", // OpenRouter base URL
                    //     apiKey: process.env.OPENROUTER_API_KEY, // Your OpenRouter Key from Env Vars
                    // });
                    // llmCallInProgress = await openai.chat.completions.create({
                    //     model: "openrouter/auto", // Replace with the actual model you want to use (e.g., "openai/gpt-4o", "mistralai/mistral-7b-instruct", check OpenRouter docs for available models)
                    //     messages: messagesForLlm,
                    //     stream: true, // Request streaming response
                    // });

                     // --- Simulate LLM Stream (REMOVE THIS SECTION IN ACTUAL IMPLEMENTATION) ---
                     // This simulation replaces the actual OpenRouter call for testing the framework.
                     console.log("Simulating LLM response stream...");
                     const simulatedLlmResponse = `नमस्ते! "${fullText.substring(0, Math.min(fullText.length, 30))}" के बारे में पूछने के लिए धन्यवाद। मैं ${avatarData.name} हूँ और मैं आपकी मदद करने के लिए यहाँ हूँ। मुझे बताओ कि तुम क्या जानना चाहते हो।`; // A placeholder response
                     const simulatedLlmChunks = simulatedLlmResponse.split(' '); // Split into words or chunks
                     let simulatedFullResponse = '';
                     // Signal frontend that AI is speaking as soon as we have some text
                     ws.send(JSON.stringify({ type: 'ai_speaking' })); // Should be sent when LLM starts responding

                     for (const chunk of simulatedLlmChunks) {
                          await new Promise(resolve => setTimeout(resolve, 70)); // Simulate time delay between chunks
                          const textChunk = chunk + ' '; // Add space back
                          simulatedFullResponse += textChunk;
                          // In a real scenario, you would feed this `textChunk` (or accumulating sentence/phrase) to the TTS API.
                          // console.log("Simulated LLM Chunk for TTS:", textChunk);
                           // --- Simulate TTS Streaming (REMOVE THIS SECTION IN ACTUAL IMPLEMENTATION) ---
                           // In a real implementation, Replicate would return audio chunks.
                           // You would send those audio chunks to the frontend here.
                           // ws.send(JSON.stringify({ type: 'ai_audio_stream', audioChunk: Buffer.from('...', 'binary') })); // Example
                           // For simulation, we just pretend audio is being streamed.
                     }
                     console.log("Simulated LLM stream finished.");
                     // --- End Simulate LLM Stream ---


                    // 4. Process LLM Text Stream and Call Replicate TTS API (Streaming)
                    // As text arrives from the LLM stream (from OpenRouter):
                    // - You need to accumulate the text into sentences or phrases.
                    // - For each sentence/phrase, call the Replicate XTTS-v2 API.
                    // - You'll need the Wasabi URL for the avatar's 5-10 second voice sample (`avatarData.voiceSampleKey` -> `getPresignedUrl`).
                    // - Check Replicate's documentation if XTTS-v2 supports streaming output. If yes, process and forward audio chunks immediately. If not, you'll have to wait for the full audio and send it. Streaming is preferred for responsiveness.
                    // - As you get audio chunks from Replicate:
                    //   - Send them to the frontend via `ws.send(JSON.stringify({ type: 'ai_audio_stream', audioChunk: audioDataBuffer }))`. The frontend JavaScript needs to buffer and play these.

                    // TODO: Add Replicate XTTS-v2 API call and audio streaming logic here.
                    // Example using Replicate SDK:
                    // const Replicate = require('replicate'); // Need to require if using SDK
                    // const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN }); // Your Replicate Token from Env Vars
                    // const voiceSampleUrl = await getPresignedUrl(avatarData.voiceSampleKey); // Assuming voice sample key is stored in avatarData

                    // ttsCallInProgress = replicate.run(
                    //     "replicate/xtts-v2:4b1bf2f3c1c929c64cb59b3b24fc21c5893aa84463a3e6033ad887c636b886a6", // XTTS-v2 model ID
                    //     {
                    //         input: {
                    //             text: simulatedFullResponse, // Or the sentence/phrase chunk from LLM
                    //             speaker_wav: voiceSampleUrl, // URL to the 5-10 second voice sample
                    //             language: "hi", // Specify Hindi
                    //             // Add other parameters like temperature, speed as needed
                    //         },
                    //         // TODO: Check Replicate documentation for streaming output options or webhooks
                    //     }
                    // );
                    // // If Replicate returns a stream or uses webhooks, listen for audio chunks and send them via `ws.send({ type: 'ai_audio_stream', audioChunk: ... })`.


                    // 5. Handle Completion and Save Conversation History
                    // This logic runs AFTER the AI has finished generating the full text response and all TTS audio has been processed/streamed.

                    // Add the AI's full response to the history array for this session.
                    currentConversationHistory.push({ role: 'assistant', content: simulatedFullResponse }); // Use the actual full response text from LLM stream

                    // TODO: Save the updated `currentConversationHistory` to Firebase Firestore.
                    // Design your Firestore structure. A common approach is one document per conversation session,
                    // identified by user ID and avatar ID, perhaps with a session ID or timestamp.
                    // This will require implementing a function like `saveConversationHistory`.
                    // await saveConversationHistory(currentUserId, currentAvatarId, currentConversationHistory); // Need to implement saveConversationHistory

                     console.log("Conversation history updated and saved (placeholder logic).");


                    // Signal the frontend that the AI has finished speaking
                    ws.send(JSON.stringify({ type: 'ai_finished_speaking' }));

                } catch (aiProcessingError) {
                    // Handle any errors that occur within the AI processing pipeline (LLM, TTS, DB loading)
                    console.error("Error during AI processing pipeline:", aiProcessingError);
                    // Send an error signal or a fallback text message to the frontend
                    ws.send(JSON.stringify({ type: 'ai_error', message: 'Sorry, I encountered an error while processing.' }));
                    // Ensure the frontend UI resets even if an error occurred
                    ws.send(JSON.stringify({ type: 'ai_finished_speaking' }));
                } finally {
                    // Reset processing state regardless of success or failure
                    isProcessing = false;
                    llmCallInProgress = null; // Clear references to ongoing API calls
                    ttsCallInProgress = null;
                }

            } else if (data.type === 'user_interrupted') {
                 // Frontend detects that the user started speaking while the AI was speaking.
                 console.log("User interruption detected. Stopping ongoing AI processes.");

                 // --- Implement Interruption Logic ---
                 // This is a critical part of the natural conversation flow.
                 // You need to stop any ongoing asynchronous operations like LLM text generation or TTS audio generation for THIS connection.
                 // The specific way to cancel depends on the Node.js libraries/SDKs you are using for OpenRouter and Replicate.
                 // Look for cancellation tokens or abort methods in their documentation.

                 if (llmCallInProgress) {
                     console.log("Attempting to cancel ongoing LLM call...");
                     // TODO: Call the cancellation method provided by your LLM SDK/API client
                     // Example: llmCallInProgress.cancel(); // Depends on the SDK
                     llmCallInProgress = null; // Clear the reference after attempting cancellation
                 }
                  if (ttsCallInProgress) {
                     console.log("Attempting to cancel ongoing TTS call...");
                      // TODO: Call the cancellation method provided by your TTS SDK/API client
                      // Example: ttsCallInProgress.abort(); // Depends on the SDK
                     ttsCallInProgress = null; // Clear the reference after attempting cancellation
                 }

                 // Reset the processing flag to allow the user's new speech to be processed
                 isProcessing = false;

                 // The frontend should already be transitioning to the 'listening' state and sending new 'audio_text_chunk' messages.

            } else {
                // Log any message types that are not recognized
                console.warn('Received unknown message type from client:', data.type, data);
            }

        } catch (parseError) {
            // Handle errors if the incoming message is not valid JSON
            console.error('Error parsing WebSocket message:', parseError);
            // Send an error back to the client
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format received.' }));
        }
    });

    // === WebSocket Connection Closing Handling ===
    // This event fires when a client disconnects.
    ws.on('close', (code, reason) => {
        console.log(`Client disconnected from WebSocket. Code: ${code}, Reason: ${reason || 'N/A'}`);
        // --- Clean up state specific to this connection ---
        // Cancel any ongoing API calls for this connection when it closes
         if (llmCallInProgress) {
             console.log("Connection closed. Cancelling ongoing LLM call.");
             // TODO: Call cancellation method
             llmCallInProgress = null;
         }
          if (ttsCallInProgress) {
             console.log("Connection closed. Cancelling ongoing TTS call.");
              // TODO: Call cancellation method
             ttsCallInProgress = null;
         }

        // --- Save Final Conversation History ---
        // TODO: Save the final state of `currentConversationHistory` to Firebase Firestore.
        // This might need to be done asynchronously or managed in a way that doesn't block the close handler.
        // await saveConversationHistory(currentUserId, currentAvatarId, currentConversationHistory); // Requires async close handler or saving periodically

         console.log("Conversation state cleaned up for disconnected client.");
    });

    // === WebSocket Error Handling ===
    // This event fires if an error occurs on the WebSocket connection.
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        // Log the error. The 'close' event will likely follow.
        // Attempting to close the connection might also be necessary depending on the error.
        // ws.close(1011, 'Internal Server Error'); // 1011 is a standard WebSocket error code
    });

    // --- Initial message to the client ---
    // Optional: Send a message to the frontend as soon as the connection is established.
    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to backend WebSocket.' }));
});


// === Helper functions for Firebase Conversation History (NEEDS IMPLEMENTATION) ===
// These functions are placeholders. You need to write the actual code to interact with Firestore.

// Function to load previous conversation history from Firestore
// async function loadConversationHistory(userId, avatarId, options = {}) {
//     if (!dbFirestore) {
//          console.error("Firestore not available. Cannot load history.");
//          return [];
//     }
//     console.log(`Loading conversation history for user "${userId}" and avatar "${avatarId}" (placeholder).`);
//
//     // TODO: Implement Firestore query logic here:
//     // - Query the CONVERSATIONS_COLLECTION.
//     // - Filter by userId and avatarId.
//     // - Order by timestamp.
//     // - Implement filtering for the last 1 day (or specified duration in options).
//     // - Fetch the documents.
//     // - Reconstruct the history array from the documents. You might have one document per session,
//     //   or one document per day, or append messages to a single document. Choose a suitable structure.
//
//     // Example query (assumes docs have userId, avatarId, and timestamp fields):
//     // const historySnapshot = await dbFirestore.collection(CONVERSATIONS_COLLECTION)
//     //     .where('userId', '==', userId)
//     //     .where('avatarId', '==', avatarId)
//     //     // Add time filtering here, e.g., .where('timestamp', '>=', timestampYesterday)
//     //     .orderBy('timestamp', 'asc')
//     //     .get();
//
//     // let loadedHistory = [];
//     // historySnapshot.forEach(doc => {
//     //     // Process each history document and add messages to loadedHistory
//     // });
//
//     // return loadedHistory; // Return the loaded history array
//      return []; // Placeholder return
// }

// Function to save current conversation history to Firestore
// async function saveConversationHistory(userId, avatarId, history) {
//     if (!dbFirestore) {
//         console.error("Firestore not available. Cannot save history.");
//         return;
//     }
//     // Only save if there's history to save
//     if (!history || history.length === 0) {
//         console.log("No conversation history to save.");
//         return;
//     }
//     console.log(`Saving conversation history for user "${userId}" and avatar "${avatarId}" (placeholder). History length: ${history.length}`);
//
//     // TODO: Implement Firestore save logic here:
//     // - Decide how to structure conversations (e.g., one document per session, append to a daily document, etc.).
//     // - Get a reference to the relevant document(s) in the CONVERSATIONS_COLLECTION based on userId, avatarId, and perhaps a session identifier.
//     // - Save the current `history` array (or the latest message) to Firestore.
//     // - Ensure atomicity if updating existing documents concurrently.
//
//     // Example (saving the entire session history to one doc, might hit doc size limits for long chats):
//     // const sessionId = 'some_unique_session_id'; // You need to generate/manage session IDs
//     // const conversationDocRef = dbFirestore.collection(CONVERSATIONS_COLLECTION).doc(`${userId}_${avatarId}_${sessionId}`);
//     // await conversationDocRef.set({
//     //     userId: userId,
//     //     avatarId: avatarId,
//     //     history: history, // Save the entire array
//     //     timestamp: admin.firestore.FieldValue.serverTimestamp(),
//     //     // Add other relevant metadata
//     // });
//
//     // Example (appending latest message - more complex but avoids doc size limits):
//      // Need to design how messages are structured and queried
//
//     console.log("History saved (placeholder logic).");
// }


// ======== Server Initialization ========
// This function starts the necessary services (PostgreSQL DB, HTTP/WebSocket Server).
const startServer = async () => {
  try {
    // Initialize PostgreSQL Database (creates tables if they don't exist)
    await initializeDatabase();
    console.log('PostgreSQL Database initialization checked and ready.');

    // The HTTP/WebSocket server is started by the `server = app.listen(...)` call
    // which is placed outside this function so that `wss` can be created using the `server` instance.
    // The HTTP/WebSocket server will start listening for connections after initializeDatabase completes successfully.

  } catch (err) {
    // If database initialization or server startup fails, log the error and exit.
    console.error("FATAL ERROR: Failed to initialize database or start HTTP server:", err);
    process.exit(1); // Exit the Node.js process with an error code
  }
};

// Call the function to start the server and initialize databases.
startServer();

// ======== Graceful Shutdown Handling ========
// Listen for termination signals (like SIGTERM from hosting platforms) to shut down the server gracefully.
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Starting graceful server shutdown.');
    // Close the HTTP server (stops accepting new connections)
    server.close(() => {
        console.log('HTTP server closed.');
        // Close WebSocket connections gracefully (sends a closing frame to clients)
        wss.clients.forEach(client => {
             try {
                 client.close(1000, 'Server shutting down'); // 1000 is Normal Closure code
             } catch (e) {
                 console.warn('Error closing WebSocket client:', e);
             }
        });
        // Give clients a short time to receive the closing frame and disconnect gracefully
        setTimeout(() => {
            // Forcefully close the WebSocket server if clients haven't disconnected
            wss.close(() => {
                console.log('WebSocket server closed.');
                 // Close the PostgreSQL database pool (release all connections)
                 pool.end().then(() => {
                     console.log('PostgreSQL pool has ended.');
                     // Firebase Admin SDK does not typically require explicit shutdown unless using specific features like Realtime Database listeners.
                     // If needed, you would add Firebase cleanup here.
                     console.log('Server shut down successfully.');
                     process.exit(0); // Exit the process successfully
                 }).catch(err => {
                     console.error('Error ending PostgreSQL pool during shutdown:', err);
                     process.exit(1); // Exit with an error code if pool ending fails
                 });
            });
        }, 5000); // Wait for 5 seconds for clients to close
    });
});

// Listen for SIGINT (Ctrl+C) for graceful shutdown during local development
process.on('SIGINT', () => {
    console.log('SIGINT signal received. Starting graceful server shutdown.');
    // Trigger the same shutdown logic as SIGTERM
    process.emit('SIGTERM');
});
