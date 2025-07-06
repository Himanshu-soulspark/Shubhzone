const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPresignedUrl, generateUploadUrl } = require('./wasabi.js');
const { pool, initializeDatabase } = require('./db.js');

// dotenv को कॉन्फ़िगर करना
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
// अब यह Content-Type भी लेता है ताकि Wasabi सही मेटाडेटा सेट कर सके।
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

// GET /api/playlists - सभी प्लेलिस्ट की लिस्ट प्राप्त करना (ड्रॉपडाउन के लिए)
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

// POST /api/videos - एक नया वीडियो सेव करना (अब प्लेलिस्ट से लिंक है)
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

// GET /api/videos/:key/play - एक वीडियो के लिए सुरक्षित प्लेबैक URL प्राप्त करना
app.get('/api/videos/:key/play', async (req, res) => {
  try {
    const { key } = req.params;
    const signedUrl = await getPresignedUrl(key);
    res.status(200).json({ success: true, url: signedUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: "Could not get video URL." });
  }
});

// --- होम पेज डेटा एंडपॉइंट ---

// GET /api/home-content - होम पेज के लिए सभी प्लेलिस्ट और उनके वीडियो को लाना
app.get('/api/home-content', async (req, res) => {
  try {
    // 1. सभी प्लेलिस्ट को उनके थंबनेल URL के साथ प्राप्त करें
    const playlistsQuery = `SELECT id, name, thumbnail_key FROM playlists ORDER BY created_at DESC;`;
    const playlistsResult = await pool.query(playlistsQuery);
    
    // 2. सभी वीडियो को उनके थंबनेल URL के साथ प्राप्त करें
    const videosQuery = `SELECT id, title, thumbnail_key as video_thumbnail_key, playlist_id, video_key FROM videos ORDER BY created_at DESC;`;
    const videosResult = await pool.query(videosQuery);
    
    // 3. हर प्लेलिस्ट के लिए एक अस्थायी (pre-signed) URL जेनरेट करें
    const playlistsWithUrls = await Promise.all(playlistsResult.rows.map(async (p) => {
        return {
            ...p,
            thumbnailUrl: await getPresignedUrl(p.thumbnail_key)
        };
    }));
    
    // 4. हर वीडियो के लिए एक अस्थायी (pre-signed) URL जेनरेट करें
    const videosWithUrls = await Promise.all(videosResult.rows.map(async (v) => {
        return {
            ...v,
            thumbnailUrl: await getPresignedUrl(v.video_thumbnail_key)
        };
    }));
    
    res.status(200).json({
        success: true,
        playlists: playlistsWithUrls,
        videos: videosWithUrls
    });

  } catch (err) {
    console.error("Error fetching home content:", err);
    res.status(500).json({ success: false, message: 'Failed to fetch home content.' });
  }
});


// ======== फ्रंटएंड सर्विंग ========
// यह सुनिश्चित करता है कि कोई भी अनजाना रूट index.html को लोड करे
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ======== सर्वर और डेटाबेस को शुरू करना ========
const startServer = async () => {
  await initializeDatabase(); // पहले टेबल बनाना सुनिश्चित करें
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
