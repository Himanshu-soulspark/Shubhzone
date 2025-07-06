const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPresignedUrl, generateUploadUrl } = require('./wasabi.js');
const { pool, initializeDatabase } = require('./db.js');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// ... (अन्य API एंडपॉइंट्स जैसे /api/generate-upload-url, /api/playlists, /api/videos अपरिवर्तित रहेंगे) ...
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

app.get('/api/playlists', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM playlists ORDER BY name ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching playlists:", err);
    res.status(500).json({ success: false, message: 'Failed to fetch playlists.' });
  }
});

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

app.get('/api/videos/:key/play', async (req, res) => {
  try {
    const { key } = req.params;
    const signedUrl = await getPresignedUrl(key);
    res.status(200).json({ success: true, url: signedUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not get video URL." });
  }
});


// ======== यहाँ मुख्य सुधार है ========
// GET /api/home-content - होम पेज के लिए सभी डेटा को और सुरक्षित तरीके से लाना
app.get('/api/home-content', async (req, res) => {
  try {
    // 1. डेटाबेस से सभी प्लेलिस्ट और वीडियो प्राप्त करें
    const playlistsQuery = `SELECT id, name, thumbnail_key FROM playlists ORDER BY created_at DESC;`;
    const videosQuery = `SELECT id, title, thumbnail_key as video_thumbnail_key, playlist_id, video_key FROM videos ORDER BY created_at DESC;`;
    
    const [playlistsResult, videosResult] = await Promise.all([
        pool.query(playlistsQuery),
        pool.query(videosQuery)
    ]);
    
    // सुरक्षित URL जेनरेटर फंक्शन
    const getSafePresignedUrl = async (key) => {
        if (!key) return null; // अगर key ही नहीं है तो null लौटाएं
        try {
            return await getPresignedUrl(key);
        } catch (urlError) {
            // अगर किसी एक URL को बनाने में एरर आती है, तो उसे लॉग करें लेकिन ऐप को क्रैश न करें
            console.error(`Could not generate URL for key: ${key}`, urlError);
            return null; // एरर की स्थिति में null लौटाएं
        }
    };

    // 2. हर प्लेलिस्ट और वीडियो के लिए सुरक्षित रूप से URL जेनरेट करें
    const playlistsWithUrls = (await Promise.all(playlistsResult.rows.map(async (p) => {
        const thumbnailUrl = await getSafePresignedUrl(p.thumbnail_key);
        // केवल उन्हीं प्लेलिस्ट को शामिल करें जिनका थंबनेल सफलतापूर्वक बना है
        return thumbnailUrl ? { ...p, thumbnailUrl } : null;
    }))).filter(p => p !== null); // null वाली एंट्रीज को हटा दें
    
    const videosWithUrls = (await Promise.all(videosResult.rows.map(async (v) => {
        const thumbnailUrl = await getSafePresignedUrl(v.video_thumbnail_key);
        return thumbnailUrl ? { ...v, thumbnailUrl } : null;
    }))).filter(v => v !== null);

    res.status(200).json({
        success: true,
        playlists: playlistsWithUrls,
        videos: videosWithUrls
    });

  } catch (err) {
    // यह कैच ब्लॉक अब सिर्फ डेटाबेस क्वेरी की समस्याओं को पकड़ेगा
    console.error("Critical error fetching home content from DB:", err);
    res.status(500).json({ success: false, message: 'Failed to fetch home content.' });
  }
});

// फ्रंटएंड सर्विंग
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// सर्वर और डेटाबेस को शुरू करना
const startServer = async () => {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
