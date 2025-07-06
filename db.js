const { Pool } = require('pg');

// डेटाबेस कनेक्शन पूल बनाना।
// यह process.env.DATABASE_URL का उपयोग अपने आप कर लेगा, जो आपने Render में सेट किया है।
// SSL कॉन्फ़िगरेशन Render पर PostgreSQL से कनेक्ट करने के लिए ज़रूरी है।
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * यह फंक्शन सुनिश्चित करता है कि 'videos' टेबल डेटाबेस में मौजूद है।
 * अगर टेबल नहीं है, तो यह उसे बना देगा।
 * यह ऐप के शुरू होते ही एक बार चलता है।
 */
const createVideosTable = async () => {
  // टेबल का स्ट्रक्चर। इसमें अब thumbnail_key कॉलम भी है।
  // यह कॉलम NULL हो सकता है, क्योंकि हर वीडियो का थंबनेल हो, यह ज़रूरी नहीं।
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      tags VARCHAR(255),
      video_type VARCHAR(50),
      video_key TEXT NOT NULL,
      thumbnail_key TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log("'videos' table is checked and ready.");
  } catch (err) {
    console.error("Error creating or checking 'videos' table:", err);
    // अगर टेबल बनाने में कोई गंभीर समस्या आती है तो सर्वर को बंद कर देना बेहतर है।
    process.exit(1);
  }
};

// इस पूल और फंक्शन को एक्सपोर्ट करना ताकि index.js में इस्तेमाल हो सके
module.exports = {
  pool,
  createVideosTable
};
