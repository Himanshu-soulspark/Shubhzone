const { Pool } = require('pg');

// डेटाबेस कनेक्शन पूल बनाना।
// यह process.env.DATABASE_URL का उपयोग अपने आप कर लेगा।
// SSL कॉन्फ़िगरेशन Render के लिए ज़रूरी है।
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// यह फंक्शन सुनिश्चित करेगा कि 'videos' टेबल मौजूद है।
const createVideosTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      tags VARCHAR(255),
      video_type VARCHAR(50),
      wasabi_url TEXT NOT NULL,
      wasabi_key TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log("'videos' table is ready.");
  } catch (err) {
    console.error("Error creating 'videos' table:", err);
  }
};

// इस पूल को एक्सपोर्ट करना ताकि index.js में इस्तेमाल हो सके
module.exports = {
  pool,
  createVideosTable
};
