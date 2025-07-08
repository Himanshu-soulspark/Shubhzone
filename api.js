const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const axios = require('axios');

const router = express.Router();

// --- Wasabi S3 कॉन्फ़िगरेशन ---
const s3 = new AWS.S3({
  endpoint: `s3.${process.env.WASABI_REGION}.wasabisys.com`,
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
});

// Multer को मेमोरी में फाइल स्टोर करने के लिए कॉन्फ़िगर करें
const upload = multer({ storage: multer.memoryStorage() });


//==================================================
//         वीडियो अपलोड का लॉजिक
//==================================================
router.post('/videos/upload', upload.single('videoFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No video file provided.' });
  }

  const file = req.file;
  const fileName = `${Date.now()}_${file.originalname}`;

  const params = {
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read',
  };

  try {
    const data = await s3.upload(params).promise();
    console.log('File uploaded successfully to Wasabi:', data.Location);

    const cdnUrl = data.Location.replace(
      `s3.${process.env.WASABI_REGION}.wasabisys.com/${process.env.WASABI_BUCKET_NAME}`,
      process.env.BUNNY_PULL_ZONE_URL.replace('https://', '')
    );

    res.status(200).json({
      success: true,
      message: 'Video uploaded successfully!',
      url: cdnUrl
    });
  } catch (error) {
    console.error('Error uploading to Wasabi:', error);
    res.status(500).json({ success: false, message: 'Failed to upload video.' });
  }
});


//==================================================
//              AI चैट का लॉजिक
//==================================================
router.post('/ai/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: 'No message provided.' });
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    res.status(200).json({ success: true, reply: aiResponse });

  } catch (error) {
    console.error('Error with OpenRouter API:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, message: 'Failed to get response from AI.' });
  }
});


module.exports = router;
