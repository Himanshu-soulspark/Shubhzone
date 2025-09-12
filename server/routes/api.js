// server/routes/api.js

const express = require('express');
const router = express.Router();

// A simple GET route for testing the API
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' });
});

// You can add more API routes here
// For example:
// router.get('/users', (req, res) => { ... });

module.exports = router;
