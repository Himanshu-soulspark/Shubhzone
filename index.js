// सबसे पहले .env से वेरिएबल्स लोड करें
require('dotenv').config();

const express = require('express');
const cors = 'require'('cors');
const videoRoutes = require('./routes/video.routes');
const aiRoutes = require('./routes/ai.routes');

const app = express();

// Middleware
app.use(cors()); // ताकि आपका फ्रंटएंड बैकएंड से बात कर सके
app.use(express.json()); // JSON बॉडी को समझने के लिए
app.use(express.urlencoded({ extended: true })); // फॉर्म डेटा को समझने के लिए

// बेसिक रूट यह चेक करने के लिए कि सर्वर चल रहा है
app.get('/', (req, res) => {
  res.send('Shubhzone Backend is running!');
});

// API Routes
app.use('/api/videos', videoRoutes);
app.use('/api/ai', aiRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
