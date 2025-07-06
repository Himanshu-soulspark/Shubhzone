const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPresignedUrl, generateUploadUrl } = require('./wasabi.js');
const { pool, createVideosTable } = require('./db.js');

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

// GET /api/videos - डेटाबेस से सभी वीडियो की लिस्ट प्राप्त करना
app.get('/api/videos', async (req, res) => {
  try {
    // अब हम thumbnail_key को भी सेलेक्ट कर रहे हैं
    const result = await pool.query('SELECT id, title, video_key, thumbnail_key, created_at FROM videos ORDER BY created_at DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch videos.' });
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


// GET /api/generate-upload-url - डायरेक्ट अपलोड के लिए एक सुरक्षित URL जेनरेट करना
app.get('/api/generate-upload-url', async (req, res) => {
  try {
    const { fileName } = req.query;
    if (!fileName) {
      return res.status(400).json({ message: 'fileName query parameter is required.' });
    }
    const { uploadUrl, key } = await generateUploadUrl(fileName);
    res.status(200).json({ success: true, uploadUrl, key });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not get upload URL.' });
  }
});

// POST /api/save-video-details - डायरेक्ट अपलोड पूरा होने के बाद वीडियो की जानकारी सेव करना
app.post('/api/save-video-details', async (req, res) => {
  // अब हम रिक्वेस्ट से thumbnail_key भी ले रहे हैं
  const { title, description, tags, videoType, video_key, thumbnail_key } = req.body;

  if (!title || !video_key) {
    return res.status(400).json({ success: false, message: 'Title and video_key are required.' });
  }

  try {
    const insertQuery = `
      INSERT INTO videos (title, description, tags, video_type, video_key, thumbnail_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [title, description, tags, videoType, video_key, thumbnail_key];
    const dbResult = await pool.query(insertQuery, values);

    console.log('Video details saved after direct upload:', dbResult.rows[0]);
    res.status(201).json({ success: true, video: dbResult.rows[0] });
  } catch (err) {
    console.error('Error saving video details:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


// ======== फ्रंटएंड सर्विंग ========
// यह सुनिश्चित करता है कि कोई भी अनजाना रूट index.html को लोड करे
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ======== सर्वर और डेटाबेस को शुरू करना ========
const startServer = async () => {
  await createVideosTable(); // पहले टेबल बनाना सुनिश्चित करें
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
