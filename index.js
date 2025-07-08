// सबसे पहले .env से वेरिएबल्स लोड करें
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./api'); // <-- हमने इसे यहाँ बदल दिया है

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// बेसिक रूट यह चेक करने के लिए कि सर्वर चल रहा है
app.get('/', (req, res) => {
  res.send('Shubhzone Backend is running! Simplified structure.');
});

// API Routes
app.use('/api', apiRoutes); // <-- हमने इसे भी सरल कर दिया है

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
