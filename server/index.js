// server/index.js

// Import required modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

// Initialize the Express app
const app = express();

// Define the port, with a fallback to 8080 if not specified in .env
const PORT = process.env.PORT || 8080;

// Middleware Setup
// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Enable parsing of JSON bodies in requests
app.use(express.json());

// Serve static files from the 'public' directory
// The path.join ensures it works correctly on any operating system
app.use(express.static(path.join(__dirname, '../public')));

// Import and use the external API router
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes); // All routes in api.js will be prefixed with /api

// Start the server and listen for incoming connections
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
