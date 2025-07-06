// File: index.js (Final, Stable, and Non-Compressed Version)

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPresignedUrl, generateUploadUrl } = require('./wasabi.js');
const { pool, initializeDatabase } = require('./db.js');

// dotenv को कॉन्फ़िगर करना (केवल डेवलपमेंट के लिए)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3001;

// मिडलवेयर
app.use(cors());
app.use(express.json()); // JSON बॉडी को पार्स करने के लिए
app.use(express.static(path.join(__dirname, '/')));

// ======== API रूट्स ========

// --- जेनेरिक अपलोड URL जेनरेटर ---
// (अपरिवर्तित - यह फंक्शन सही काम कर रहा है)
app.get('/api/generate-upload-url', async (req, res) => {
  try {
    const { fileName, contentType } = req.query;
    if (!fileName || !contentType) {
      return res.status(400).json({ success: false, message: 'fileName and contentType query parameters are required.' });
    }
    const { uploadUrl, key } = await generateUploadUrl(fileName, contentType);
    res.status(200).json({ success: true, uploadUrl, key });
  } catch (err) {
    console.error("Error in /api/generate-upload-url:", err);
    res.status(500).json({ success: false, message: 'Could not get upload URL.' });
  }
});

// --- प्लेलिस्ट एंडपॉइंट्स ---
// (अपरिवर्तित - यह सभी फंक्शन्स सही काम कर रहे हैं)

// POST /api/playlists - एक नई प्लेलिस्ट बनाना
app.post('/api/playlists', async (req, res) => {
  const { name, thumbnail_key } = req.body;
  if (!name || !thumbnail_key) {
    return res.status(400).json({ success: false, message: 'Playlist name and thumbnail_key are required.' });
  }
  try {
    const insertQuery = `INSERT INTO playlists (name, thumbnail_key) VALUES ($1, $2) RETURNING *;`;
    const result = await pool.query(insertQuery, [name, thumbnail_key]);
    res.status(201).json({ success: true, playlist: result.rows[0] });
  } catch (err) {
    console.error("Error creating playlist:", err);
    res.status(500).json({ success: false, message: 'Failed to create playlist.' });
  }
});

// GET /api/playlists - सभी प्लेलिस्ट की लिस्ट प्राप्त करना
app.get('/api/playlists', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM playlists ORDER BY name ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching playlists:", err);
    res.status(500).json({ success: false, message: 'Failed to fetch playlists.' });
  }
});

// --- वीडियो एंडपॉइंट्स ---
// (अपरिवर्तित - यह सभी फंक्शन्स सही काम कर रहे हैं)

// POST /api/videos - एक नया वीडियो सेव करना
app.post('/api/videos', async (req, res) => {
  const { title, video_key, thumbnail_key, playlist_id, age_restriction } = req.body;
  if (!title || !video_key || !thumbnail_key || !playlist_id) {
    return res.status(400).json({ success: false, message: 'Title, video_key, thumbnail_key, and playlist_id are required.' });
  }
  try {
    const insertQuery = `
      INSERT INTO videos (title, video_key, thumbnail_key, playlist_id, age_restriction)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [title, video_key, thumbnail_key, parseInt(playlist_id, 10), age_restriction || 'all'];
    const result = await pool.query(insertQuery, values);
    res.status(201).json({ success: true, video: result.rows[0] });
  } catch (err) {
    console.error('Error saving video details:', err);
    res.status(500).json({ success: false, message: 'Failed to save video details.' });
  }
});

// GET /api/videos/:key/play - वीडियो के लिए सुरक्षित प्लेबैक URL प्राप्त करना
app.get('/api/videos/:key/play', async (req, res) => {
  try {
    const { key } = req.params;
    const signedUrl = await getPresignedUrl(key);
    res.status(200).json({ success: true, url: signedUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not get video URL." });
  }
});

// --- होम पेज डेटा एंडपॉइंट (एकमात्र और सबसे महत्वपूर्ण बदलाव यहाँ है) ---

// GET /api/home-content - होम पेज के लिए सभी डेटा को और सुरक्षित तरीके से लाना
app.get('/api/home-content', async (req, res) => {
  try {
    // स्टेप 1: डेटाबेस से सभी प्लेलिस्ट और वीडियो को एक साथ प्राप्त करें
    const playlistsQuery = `SELECT id, name, thumbnail_key FROM playlists ORDER BY created_at DESC;`;
    const videosQuery = `SELECT id, title, thumbnail_key AS video_thumbnail_key, playlist_id, video_key FROM videos ORDER BY created_at DESC;`;
    
    const [playlistsResult, videosResult] = await Promise.all([
        pool.query(playlistsQuery),
        pool.query(videosQuery)
    ]);
    
    // स्टेप 2: एक सुरक्षित URL जेनरेटर फंक्शन जो एरर को हैंडल कर सके
    // यह फंक्शन सुनिश्चित करेगा कि अगर कोई एक URL नहीं बनता है तो ऐप क्रैश न हो।
    const getSafePresignedUrl = async (key) => {
        // अगर की (key) मौजूद नहीं है, तो तुरंत null लौटा दें।
        if (!key) {
            return null;
        }
        try {
            // URL बनाने की कोशिश करें।
            return await getPresignedUrl(key);
        } catch (urlError) {
            // अगर URL बनाने में कोई समस्या आती है (जैसे Wasabi में फ़ाइल नहीं मिली),
            // तो कंसोल में एरर दिखाएं और null लौटा दें।
            console.error(`Could not generate URL for key: ${key}. Error: ${urlError.message}`);
            return null;
        }
    };

    // स्टेप 3: हर प्लेलिस्ट और वीडियो के लिए सुरक्षित रूप से URL जेनरेट करें
    const playlistsWithUrls = (await Promise.all(
        playlistsResult.rows.map(async (playlist) => {
            const thumbnailUrl = await getSafePresignedUrl(playlist.thumbnail_key);
            // केवल उन्हीं प्लेलिस्ट को लौटाएं जिनका थंबनेल सफलतापूर्वक बन गया है।
            return thumbnailUrl ? { ...playlist, thumbnailUrl } : null;
        })
    )).filter(p => p !== null); // उन सभी एंट्रीज को हटा दें जो null हैं।
    
    const videosWithUrls = (await Promise.all(
        videosResult.rows.map(async (video) => {
            const thumbnailUrl = await getSafePresignedUrl(video.video_thumbnail_key);
            // केवल उन्हीं वीडियो को लौटाएं जिनका थंबनेल सफलतापूर्वक बन गया है।
            return thumbnailUrl ? { ...video, thumbnailUrl } : null;
        })
    )).filter(v => v !== null);

    // स्टेप 4: सफल परिणाम भेजें
    res.status(200).json({
        success: true,
        playlists: playlistsWithUrls,
        videos: videosWithUrls
    });

  } catch (dbError) {
    // यह कैच ब्लॉक अब सिर्फ डेटाबेस कनेक्शन या क्वेरी की गंभीर समस्याओं को पकड़ेगा।
    console.error("Critical error fetching data from Database:", dbError);
    res.status(500).json({ success: false, message: 'Failed to fetch home content due to a server database error.' });
  }
});


// ======== फ्रंटएंड सर्विंग ========
// (अपरिवर्तित)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ======== सर्वर और डेटाबेस को शुरू करना ========
// (अपरिवर्तित)
const startServer = async () => {
  await initializeDatabase(); // पहले टेबल बनाना सुनिश्चित करें
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
