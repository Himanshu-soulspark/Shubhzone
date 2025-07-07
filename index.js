
// File: index.js (Complete Backend for Video App + AI Avatar Data & WebSocket Server)

// ======== Required Libraries ========
const express = require('express'); // For handling HTTP requests (API routes)
const cors = require('cors'); // For allowing cross-origin requests from frontend
const path = require('path'); // For handling file paths (serving index.html)
const { Server } = require('ws'); // WebSocket server library (for real-time AI chat)
const admin = require('firebase-admin'); // Firebase Admin SDK (for Firestore)
const { getPresignedUrl, generateUploadUrl } = require('./wasabi.js'); // Existing functions for Wasabi interaction
const { pool, initializeDatabase } = require('./db.js'); // Existing functions for PostgreSQL DB interaction
const aiChatHandler = require('./ai_chat.js'); // *** NEW: Import the AI chat message handler ***

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
let firebaseInitialized = false; // Flag to track successful initialization

try {
    // Get the Base64 encoded service account key from environment variables
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    const databaseURLFirebase = process.env.DATABASE_URL_FIREBASE; // Although optional for Firestore, good practice to include if available

    if (!serviceAccountBase64) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
    }

    // Decode the Base64 string back into a JSON string
    const serviceAccountJsonString = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');

    // Parse the JSON string into a JavaScript object
    const serviceAccount = JSON.parse(serviceAccountJsonString);

    // Check if Firebase app is already initialized (important for hot-reloading environments, less critical on Render)
    if (admin.apps.length === 0) {
         admin.initializeApp({
             credential: admin.credential.cert(serviceAccount),
             databaseURL: databaseURLFirebase // Optional: Add if using RTDB or need explicit URL
         });
    } else {
         // If already initialized, use the default app
         admin.app();
    }


    // Get the Firestore database instance
    dbFirestore = admin.firestore();
    firebaseInitialized = true; // Set flag to true
    console.log('Firebase Admin SDK and Firestore initialized successfully.');

} catch (error) {
    // Log a critical error if Firebase initialization fails
    console.error('FATAL ERROR: Failed to initialize Firebase Admin SDK:', error);
    console.error('Please ensure FIREBASE_SERVICE_ACCOUNT_BASE64 is set correctly in Render Environment Variables and is a valid Base64 encoded JSON string.');
    // We might choose to exit the process here because Firebase is essential for AI avatars.
    // process.exit(1); // Uncomment this line if you want the server to stop if Firebase fails
    // For now, we will allow the server to start but Firestore operations will likely fail.
}

// Pass initialized Firestore and Wasabi functions to the AI chat handler
// This makes these resources available within ai_chat.js without needing to re-initialize
aiChatHandler.setDependencies({
    dbFirestore: dbFirestore,
    firebaseInitialized: firebaseInitialized, // Pass the flag too
    getPresignedUrl: getPresignedUrl, // For getting avatar asset URLs in chat
    wasabiBucketName: process.env.WASABI_BUCKET_NAME // Pass bucket name if needed in ai_chat
    // Add other dependencies needed by ai_chat.js here, e.g., API keys
    // openrouterApiKey: process.env.OPENROUTER_API_KEY, // Will be needed in ai_chat.js
    // replicateApiToken: process.env.REPLICATE_API_TOKEN, // Will be needed in ai_chat.js
    // Add STT related API keys here too if not using browser STT
});


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
const CONVERSATIONS_COLLECTION = 'conversations'; // Although conversation logic is in ai_chat.js, collection name is defined here

// Helper to check if Firebase is initialized before attempting Firestore operations
const checkFirebaseInitialized = (res) => {
    if (!firebaseInitialized || !dbFirestore) {
        const errorMsg = "Firebase Firestore is not initialized.";
        console.error(`Firestore Operation Failed: ${errorMsg}`);
        res.status(500).json({ success: false, message: 'Database not available. Firebase initialization failed on the server.' });
        return false;
    }
    return true;
};


// POST /api/avatars - Endpoint to save a new AI avatar's metadata to Firestore.
// Used by the development upload form on the frontend.
app.post('/api/avatars', async (req, res) => {
    // Check if Firestore was successfully initialized
    if (!checkFirebaseInitialized(res)) return;

    // Extract avatar metadata from the request body
    // Added voice_sample_key based on frontend update
    const { name, personalityPrompt, image_key, video_key, voice_sample_key } = req.body;

    // Perform basic validation of required fields
    // Added voice_sample_key to validation
    if (!name || !personalityPrompt || !image_key || !video_key || !voice_sample_key) {
        return res.status(400).json({ success: false, message: 'Request body must contain "name", "personalityPrompt", "image_key", "video_key", and "voice_sample_key".' });
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
            image_key: image_key, // Wasabi key for the image asset (1:1)
            video_key: video_key, // Wasabi key for the main video loop (talking/idle/etc. - 9:16)
            voice_sample_key: voice_sample_key, // Wasabi key for the voice sample (MP3)
            created_at: admin.firestore.FieldValue.serverTimestamp() // Add a server-side timestamp for creation time
            // You can add more fields here later, like other video_keys (idle, listening), etc.
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
// Used by the frontend Package page to display the list of avatars and by the AI chat handler.
app.get('/api/avatars', async (req, res) => {
    // Check if Firestore was successfully initialized
    if (!checkFirebaseInitialized(res)) return;

    try {
        // Get a reference to the Firestore collection and order by creation time
        const avatarsCollectionRef = dbFirestore.collection(AVATARS_COLLECTION);
        const snapshot = await avatarsCollectionRef.orderBy('created_at', 'asc').get(); // Fetch all documents

        // Check if the collection is empty
        if (snapshot.empty) {
            console.log("No AI avatars found in Firestore.");
            return res.status(200).json({ success: true, avatars: [], message: 'No AI avatars found.' });
        }

        // Process each avatar document to prepare data for the frontend/AI chat
        // Use Promise.all since getPresignedUrl is asynchronous
        const avatars = await Promise.all(snapshot.docs.map(async doc => {
            const avatarData = doc.data(); // Get the data from the document

            // Generate pre-signed URLs for the image, video, and voice sample assets using Wasabi function
            // Handle potential errors during URL generation gracefully by returning null
            const getSafePresignedUrl = async (key, assetType) => {
                 if (!key) return null;
                 try {
                     return await getPresignedUrl(key);
                 } catch (err) {
                     console.error(`Failed to get presigned URL for ${assetType} key ${key}: ${err.message}`);
                     return null; // Return null URL on error
                 }
            };

            const imageUrl = await getSafePresignedUrl(avatarData.image_key, 'image');
            const videoUrl = await getSafePresignedUrl(avatarData.video_key, 'video');
            const voiceSampleUrl = await getSafePresignedUrl(avatarData.voice_sample_key, 'voice sample'); // Get URL for voice sample

            // Return a structured object
            return {
                id: avatarData.id, // Document ID
                name: avatarData.name,
                personalityPrompt: avatarData.personalityPrompt,
                image_key: avatarData.image_key, // Optionally include keys
                video_key: avatarData.video_key,
                voice_sample_key: avatarData.voice_sample_key, // Optionally include key
                imageUrl: imageUrl, // The generated URL for the image (or null)
                videoUrl: videoUrl, // The generated URL for the video (or null)
                voiceSampleUrl: voiceSampleUrl // The generated URL for the voice sample (or null)
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


// ======== AI Avatar Real-time Conversation (WebSocket Server Setup) ========
// This section sets up the WebSocket server and passes connections to the AI chat handler.

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

    // Send initial connection message to the client
    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to backend WebSocket.' }));

    // === Delegate Message Handling to ai_chat.js ===
    // When a message is received from this specific client, pass it to the handler.
    ws.on('message', (message) => {
        // console.log(`Received message of type ${JSON.parse(message)?.type} from client.`); // Log message type
        aiChatHandler.handleMessage(ws, message); // Let ai_chat.js process the message
    });

    // === Delegate Connection Closing Handling ===
    // When a client disconnects, inform the handler.
    ws.on('close', (code, reason) => {
        console.log(`Client disconnected from WebSocket. Code: ${code}, Reason: ${reason || 'N/A'}`);
        aiChatHandler.handleClose(ws, code, reason); // Let ai_chat.js handle cleanup
    });

    // === Delegate WebSocket Error Handling ===
    // If an error occurs on the WebSocket connection, inform the handler.
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        aiChatHandler.handleError(ws, error); // Let ai_chat.js handle the error
    });

});


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
                 // Inform the ai_chat handler that this connection is closing
                 aiChatHandler.handleClose(client, 1000, 'Server shutting down'); // Use 1000 for normal closure
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
