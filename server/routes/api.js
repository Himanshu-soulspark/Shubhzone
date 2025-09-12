// server/routes/api.js

const express = require('express');
const router = express.Router();

// नियंत्रक (controller) फ़ंक्शंस को इम्पोर्ट करें
const { handleLogin, handleOtp } = require('../controllers/authController');

// /login के लिए POST एंडपॉइंट को परिभाषित करें
// यह रूट को नियंत्रक से handleLogin फ़ंक्शन से जोड़ता है
router.post('/login', handleLogin);

// /otp के लिए POST एंडपॉइंट को परिभाषित करें
// यह रूट को नियंत्रक से handleOtp फ़ंक्शन से जोड़ता है
router.post('/otp', handleOtp);

// राउटर को एक्सपोर्ट करें ताकि इसे मुख्य सर्वर फ़ाइल (index.js) में इस्तेमाल किया जा सके
module.exports = router;
