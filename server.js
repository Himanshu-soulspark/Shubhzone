const express = require('express');
const path = require('path');
const app = express();

// Render platform automatically ek PORT number deta hai.
// Agar wo nahi mila, to ye 3000 par chalega.
const PORT = process.env.PORT || 3000;

// =========================================================
// CRITICAL CONFIGURATION: Static File Serving
// =========================================================
// Kyunki tumne kaha file root folder me hogi, 
// hum current directory (__dirname) ko hi public folder mante hain.
app.use(express.static(__dirname));


// =========================================================
// MAIN ROUTE (Single Page Application Logic)
// =========================================================
// Ye function ensure karta hai ki user kisi bhi link par click kare
// (jaise /dashboard ya /setup), server hamesha index.html hi bhejega.
// Phir tumhara Frontend JavaScript wahan se sambhal lega.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// =========================================================
// START SERVER
// =========================================================
app.listen(PORT, () => {
    console.log(`System Online: Server is running on port ${PORT}`);
});
