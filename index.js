const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadFileToWasabi } = require('./wasabi.js');
const { pool, createVideosTable } = require('./db.js'); // db.js से इम्पोर्ट करना

// dotenv को कॉन्फ़िगर करना
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3001;

// मिडलवेयर
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

const upload = multer({ dest: 'uploads/' });

// ======== API रूट्स ========

// GET /api/videos - डेटाबेस से सभी वीडियो की लिस्ट प्राप्त करना
app.get('/api/videos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM videos ORDER BY created_at DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch videos.' });
  }
});

// POST /api/upload - वीडियो अपलोड करना और डेटाबेस में सेव करना
app.post('/api/upload', upload.single('videoFile'), async (req, res) => {
  const file = req.file;
  const { title, description, tags, videoType } = req.body;

  if (!file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  try {
    // 1. Wasabi पर फ़ाइल अपलोड करना
    const wasabiResult = await uploadFileToWasabi(file);
    
    // अस्थायी फ़ाइल को डिलीट करना
    try {
      fs.unlinkSync(file.path);
    } catch (unlinkErr) {
      console.error("Error deleting temp file:", unlinkErr);
    }

    if (!wasabiResult.success) {
      return res.status(500).json({ success: false, message: 'Failed to upload to Wasabi.' });
    }

    // 2. डेटाबेस में वीडियो की जानकारी सेव करना
    const insertQuery = `
      INSERT INTO videos (title, description, tags, video_type, wasabi_url, wasabi_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [title, description, tags, videoType, wasabiResult.url, wasabiResult.key];
    const dbResult = await pool.query(insertQuery, values);

    console.log('Video info saved to database:', dbResult.rows[0]);

    // 3. फ्रंटएंड को सफलता का संदेश भेजना
    res.status(201).json({
      success: true,
      message: 'File uploaded and data saved successfully!',
      video: dbResult.rows[0]
    });

  } catch (err) {
    console.error('Server error during upload:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ======== फ्रंटएंड सर्विंग ========
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
