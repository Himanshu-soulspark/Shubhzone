require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path'); // Node.js का इन-बिल्ट मॉड्यूल
const apiRoutes = require('./api');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- महत्वपूर्ण सेक्शन ---
// स्टैटिक फाइलों (जैसे index.html) को 'public' फोल्डर से परोसने के लिए
// हम मान रहे हैं कि आपकी index.html मुख्य डायरेक्टरी में है
app.use(express.static(__dirname));

// API के लिए रूट्स
app.use('/api', apiRoutes);

// API के अलावा किसी भी और रूट के लिए, index.html भेजें
// यह Single Page Application (SPA) के लिए महत्वपूर्ण है
app.get('*', (req, res) => {
  // सुनिश्चित करें कि यह API अनुरोध नहीं है
  if (!req.originalUrl.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});
// --------------------

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
