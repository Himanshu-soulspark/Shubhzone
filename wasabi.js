// File: wasabi.js
// This file contains all the helper functions for interacting with Wasabi cloud storage.
// It uses the AWS SDK v3 for JavaScript, which is compatible with S3-like services including Wasabi.

// ======== Required Libraries ========
// Import necessary modules from the AWS SDK.
// - S3Client: The client for interacting with the S3-compatible service.
// - PutObjectCommand: The command used to create pre-signed URLs for uploading files (PUT).
// - GetObjectCommand: The command used to create pre-signed URLs for downloading/viewing files (GET).
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
// - getSignedUrl: The function that creates the actual pre-signed URL from a command.
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ======== Wasabi Configuration ========
// Load Wasabi credentials and region information from environment variables.
// It's crucial to use environment variables for sensitive data to keep them secure.
const wasabiRegion = process.env.WASABI_REGION;
const wasabiAccessKey = process.env.WASABI_ACCESS_KEY;
const wasabiSecretKey = process.env.WASABI_SECRET_KEY;
const wasabiBucketName = process.env.WASABI_BUCKET_NAME;

// Check if all required environment variables are set. If not, log a critical error.
if (!wasabiRegion || !wasabiAccessKey || !wasabiSecretKey || !wasabiBucketName) {
    console.error("FATAL ERROR: Missing one or more Wasabi environment variables (WASABI_REGION, WASABI_ACCESS_KEY, WASABI_SECRET_KEY, WASABI_BUCKET_NAME).");
    // You might want to exit the process if Wasabi storage is essential for the app to function.
    // process.exit(1);
}

// ======== Create S3 Client for Wasabi ========
// Initialize the S3 client with the specific configuration for Wasabi.
// - endpoint: This is the URL for the Wasabi service in your chosen region.
// - region: Your Wasabi region (e.g., 'us-east-1', 'eu-central-1').
// - credentials: Your Wasabi access key and secret key.
const s3Client = new S3Client({
  endpoint: `https://s3.${wasabiRegion}.wasabisys.com`,
  region: wasabiRegion,
  credentials: {
    accessKeyId: wasabiAccessKey,
    secretAccessKey: wasabiSecretKey,
  },
});

console.log(`Wasabi S3 Client initialized for region: ${wasabiRegion}`);

/**
 * [New and Recommended Method]
 * Generates a secure, temporary pre-signed URL for uploading a file.
 * The frontend will use this URL to send the file directly to Wasabi,
 * bypassing your server and reducing server load.
 *
 * @param {string} fileName - The original name of the file to be uploaded.
 * @param {string} contentType - The MIME type of the file (e.g., 'image/jpeg', 'video/mp4').
 * @returns {Promise<object>} - A promise that resolves to an object containing the `uploadUrl` and the unique file `key`.
 */
const generateUploadUrl = async (fileName, contentType) => {
  // Create a unique key (file path/name) for the object in the Wasabi bucket.
  // Using a timestamp ensures that files with the same name do not overwrite each other.
  // Replace spaces with underscores for better URL compatibility.
  const key = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`;

  // Prepare the parameters for the PutObjectCommand.
  const params = {
    Bucket: wasabiBucketName,
    Key: key,
    ContentType: contentType // Specify the content type for the uploaded file.
  };

  try {
    // Create a new PutObjectCommand with the parameters.
    const command = new PutObjectCommand(params);

    // Generate the pre-signed URL.
    // This URL will be valid for a limited time (e.g., 15 minutes) for a PUT request.
    const expiresIn = 900; // 15 minutes in seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresIn });

    console.log(`Generated pre-signed UPLOAD URL for key: ${key}`);

    // Return the generated URL and the unique key.
    return { uploadUrl, key };
  } catch (err) {
    // If there's an error generating the URL, log it and re-throw the error
    // so the calling function can handle it.
    console.error("Error creating pre-signed upload URL:", err);
    throw new Error(`Failed to generate upload URL: ${err.message}`);
  }
};


/**
 * Generates a temporary, secure pre-signed URL for viewing or playing a file.
 * This is used to display images and play videos stored in Wasabi without
 * making the bucket public.
 *
 * @param {string} key - The key (file path/name) of the object in the Wasabi bucket.
 * @returns {Promise<string>} - A promise that resolves to the pre-signed URL (a string).
 */
const getPresignedUrl = async (key) => {
  // Prepare the parameters for the GetObjectCommand.
  const params = {
    Bucket: wasabiBucketName,
    Key: key,
  };

  try {
    // Create a new GetObjectCommand with the parameters.
    const command = new GetObjectCommand(params);

    // Generate the pre-signed URL.
    // This URL will be valid for a limited time (e.g., 15 minutes) for a GET request.
    const expiresIn = 900; // 15 minutes in seconds
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresIn });

    // console.log(`Generated pre-signed GET URL for key: ${key}`); // Can be verbose, so commented out by default.

    // Return the generated URL as a string.
    return signedUrl;
  } catch (err) {
    // If there's an error generating the URL, log it and re-throw the error.
    console.error(`Error creating pre-signed playback URL for key "${key}":`, err);
    throw new Error(`Failed to generate playback URL for key "${key}": ${err.message}`);
  }
};


// ======== Deprecated Function (For Reference Only) ========
/**
 * [DEPRECATED - NOT RECOMMENDED FOR USE]
 * This function was used to upload a file through the server (by streaming it).
 * The new `generateUploadUrl` method is preferred as it is more efficient.
 * This is kept for reference or if a server-side upload is ever needed.
 *
 * @param {object} file - A file object (e.g., from multer) containing path, originalname, mimetype.
 * @returns {Promise<object>} - A promise resolving to an object with success status and the file key.
 */
const uploadFileToServerStream = async (file) => {
  const fs = require('fs'); // Require 'fs' only if this function is used.
  const fileStream = fs.createReadStream(file.path);
  const uploadParams = {
    Bucket: wasabiBucketName,
    Key: `${Date.now()}_${file.originalname}`,
    Body: fileStream,
    ContentType: file.mimetype
  };
  try {
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    console.log(`File uploaded via server stream to key: ${uploadParams.Key}`);
    return { success: true, key: uploadParams.Key };
  } catch (err) {
    console.error("Error uploading to Wasabi via server stream:", err);
    return { success: false, error: err };
  }
};


// ======== Module Exports ========
// Export the necessary functions so they can be imported and used in other files (like index.js).
module.exports = {
  generateUploadUrl, // Recommended upload method
  getPresignedUrl,   // Recommended download/view method
  uploadFileToServerStream // Deprecated, for reference only
};
