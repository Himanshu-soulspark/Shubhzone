// File: db.js
// This file handles the connection to the PostgreSQL database
// and initializes the required tables for the video app.

const { Pool } = require('pg'); // Import the PostgreSQL client library

// Create a new database connection pool.
// The `Pool` object will automatically use the DATABASE_URL environment variable
// if it is present (which it is on Render).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Use the connection string from environment variables
  // The 'ssl' configuration is often required by hosting providers like Heroku and Render
  // to connect to their PostgreSQL databases securely.
  ssl: {
    rejectUnauthorized: false // This allows connections to hosts with self-signed certificates, which is common on these platforms.
  }
});

/**
 * This function ensures that the 'playlists' and 'videos' tables exist in the database.
 * If the tables do not exist, it creates them.
 * This function is designed to run once when the application starts up.
 */
const initializeDatabase = async () => {
  let client; // Declare client variable to be used in try/finally
  try {
    // Get a client from the connection pool
    client = await pool.connect();
    console.log("Connected to PostgreSQL database for table initialization.");

    // ---- Create 'playlists' Table ----
    // This table stores information about each video playlist.
    // - id: A unique, auto-incrementing primary key.
    // - name: The name of the playlist (e.g., "Devotional Songs").
    // - thumbnail_key: The key (file name) of the thumbnail image stored in Wasabi.
    // - created_at: A timestamp that records when the playlist was created.
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

    // ---- Create 'videos' Table ----
    // This table stores information about each individual video.
    // - id: A unique, auto-incrementing primary key.
    // - title: The title of the video.
    // - age_restriction: A flag for age-restricted content (e.g., 'all', '18+'). Defaults to 'all'.
    // - video_key: The key (file name) of the video file stored in Wasabi. It must be unique.
    // - thumbnail_key: The key of the video's thumbnail image stored in Wasabi.
    // - playlist_id: A foreign key that references the 'id' of the 'playlists' table.
    //   This links the video to a specific playlist.
    //   ON DELETE SET NULL means if a playlist is deleted, the video's playlist_id will become NULL instead of deleting the video.
    // - created_at: A timestamp that records when the video metadata was saved.
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

  } catch (err) {
    // If there is any error during table creation, log it and exit the application.
    // This is important because the app cannot function without these tables.
    console.error("CRITICAL ERROR: Failed to initialize database tables:", err);
    process.exit(1); // Exit the process with an error code.
  } finally {
    // Ensure the client connection is released back to the pool,
    // whether the try block succeeded or failed.
    if (client) {
      client.release();
      console.log("PostgreSQL client released.");
    }
  }
};

// Export the 'pool' object and the 'initializeDatabase' function
// so they can be used in other files, like index.js.
module.exports = {
  pool,
  initializeDatabase
};
