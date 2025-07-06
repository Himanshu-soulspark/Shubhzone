const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path'); // Node.js का path मॉड्यूल
const fs = require('fs'); // Node.js का file system मॉड्यूल
const { uploadFileToWasabi } = require('./wasabi.js');

// dotenv को कॉन्फ़िगर करना (लोकल डेवलपमेंट के लिए)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3001;

// मिडलवेयर
app.use(cors());
app.use(express.json());

// ======== स्टैटिक फाइल सर्विंग (यह नया हिस्सा है) ========
// यह Express को बताता है कि प्रोजेक्ट के रूट फोल्डर में मौजूद फाइलों (जैसे index.html, css, js) को सीधे सर्व करना है।
app.use(express.static(path.join(__dirname, '/')));
// ========================================================


// Multer को कॉन्फ़िगर करना
const upload = multer({ dest: 'uploads/' });

// ======== API रूट्स ========

// एक बेसिक रूट यह चेक करने के लिए कि सर्वर चल रहा है
app.get('/api/status', (req, res) => {
  res.send('Shubhzone Backend API is running!');
});

// वीडियो अपलोड के लिए API एंडपॉइंट
app.post('/api/upload', upload.single('videoFile'), async (req, res) => {
  const file = req.file;
  const { title, description, tags, videoType } = req.body;

  if (!file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  console.log('File received on server:', file.originalname);
  console.log('Metadata:', { title, description, tags, videoType });

  try {
    const result = await uploadFileToWasabi(file);

    // अस्थायी फ़ाइल को डिलीट करना
    try {
      fs.unlinkSync(file.path);
      console.log(`Temporary file ${file.path} deleted.`);
    } catch (unlinkErr) {
      console.error("Error deleting temporary file:", unlinkErr);
    }

    if (result.success) {
      console.log('Upload successful. URL:', result.url);
      res.status(200).json({
        success: true,
        message: 'File uploaded successfully to Wasabi!',
        videoUrl: result.url,
        videoKey: result.key
      });
    } else {
      res.status(500).json({ success: false, message: 'Failed to upload to Wasabi.', error: result.error });
    }
  } catch (err) {
    console.error('Server error during upload:', err);
    res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
});

// ======== फ्रंटएंड को सर्व करने के लिए कैच-ऑल रूट ========
// यह सुनिश्चित करता है कि अगर कोई किसी भी पेज पर सीधे जाता है, तो भी index.html लोड हो।
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// ======================================================


// सर्वर को सुनना शुरू करना
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
