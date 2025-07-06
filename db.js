const { Pool } = require('pg');

// डेटाबेस कनेक्शन पूल बनाना।
// यह process.env.DATABASE_URL का उपयोग अपने आप कर लेगा।
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * यह फंक्शन सुनिश्चित करता है कि 'playlists' और 'videos' टेबल डेटाबेस में मौजूद हैं।
 * अगर टेबल नहीं हैं, तो यह उन्हें बना देगा।
 * यह ऐप के शुरू होते ही एक बार चलता है।
 */
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    // ---- Playlists टेबल बनाना ----
    // इसमें हर प्लेलिस्ट का नाम और उसके थंबनेल की Key होगी जो Wasabi में स्टोर है।
    const createPlaylistsTableQuery = `
      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        thumbnail_key TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createPlaylistsTableQuery);
    console.log("'playlists' table is checked and ready.");

    // ---- Videos टेबल को अपडेट/बनाना ----
    // इसमें अब playlist_id कॉलम होगा, जो 'playlists' टेबल को रेफर करेगा।
    // 'age_restriction' को भी जोड़ा गया है।
    const createVideosTableQuery = `
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        age_restriction VARCHAR(10) DEFAULT 'all',
        video_key TEXT NOT NULL UNIQUE,
        thumbnail_key TEXT NOT NULL,
        playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createVideosTableQuery);
    console.log("'videos' table is checked and ready.");

  } catch (err)
  {
    console.error("Error initializing database tables:", err);
    process.exit(1); // अगर टेबल बनाने में कोई गंभीर समस्या आती है तो सर्वर को बंद कर दें।
  } finally
  {
    client.release();
  }
};

// इस पूल और फंक्शन को एक्सपोर्ट करना ताकि index.js में इस्तेमाल हो सके
module.exports = {
  pool,
  initializeDatabase
};
