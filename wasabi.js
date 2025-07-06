const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require("fs");

// Wasabi क्रेडेंशियल्स और रीजन को Environment Variables से लेना
const wasabiRegion = process.env.WASABI_REGION;
const wasabiAccessKey = process.env.WASABI_ACCESS_KEY;
const wasabiSecretKey = process.env.WASABI_SECRET_KEY;
const wasabiBucketName = process.env.WASABI_BUCKET_NAME;

// Wasabi के लिए S3 Client बनाना
const s3Client = new S3Client({
  region: wasabiRegion,
  endpoint: `https://s3.${wasabiRegion}.wasabisys.com`,
  credentials: {
    accessKeyId: wasabiAccessKey,
    secretAccessKey: wasabiSecretKey,
  },
});

/**
 * [अब उपयोग में नहीं] यह फंक्शन सर्वर के माध्यम से एक फ़ाइल को Wasabi बकेट में अपलोड करता है।
 * @param {object} file - Multer द्वारा दिया गया फ़ाइल ऑब्जेक्ट
 * @returns {Promise<object>} - Wasabi से मिला अपलोड का रिजल्ट
 */
const uploadFileToWasabi = async (file) => {
  const fileStream = fs.createReadStream(file.path);
  const uploadParams = {
    Bucket: wasabiBucketName,
    Key: `${Date.now()}_${file.originalname}`,
    Body: fileStream,
    ContentType: file.mimetype
  };
  try {
    const command = new PutObjectCommand(uploadParams);
    const data = await s3Client.send(command);
    console.log("Wasabi upload successful (server-side):", data);
    return { success: true, key: uploadParams.Key };
  } catch (err) {
    console.error("Error uploading to Wasabi (server-side):", err);
    return { success: false, error: err };
  }
};

/**
 * यह फंक्शन एक वीडियो को देखने के लिए एक अस्थायी, सुरक्षित URL जेनरेट करता है।
 * @param {string} key - Wasabi में फ़ाइल का नाम (Key)
 * @returns {Promise<string>} - प्री-साइन्ड URL
 */
const getPresignedUrl = async (key) => {
  const params = {
    Bucket: wasabiBucketName,
    Key: key,
  };
  
  try {
    const command = new GetObjectCommand(params);
    // यह URL 15 मिनट (900 सेकंड) के लिए वैध रहेगा
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return signedUrl;
  } catch (err) {
    console.error("Error creating presigned GET URL:", err);
    throw err;
  }
};

/**
 * यह फंक्शन क्लाइंट को सीधे Wasabi पर फ़ाइल अपलोड करने के लिए एक सुरक्षित, अस्थायी URL जेनरेट करता है।
 * @param {string} fileName - अपलोड की जाने वाली फ़ाइल का नाम
 * @returns {Promise<object>} - जिसमें uploadUrl और फ़ाइल का Key होगा
 */
const generateUploadUrl = async (fileName) => {
  // एक यूनिक की (Key) बनाना ताकि फाइलें ओवरराइट न हों
  const key = `${Date.now()}_${fileName}`;

  const params = {
    Bucket: wasabiBucketName,
    Key: key,
  };

  try {
    const command = new PutObjectCommand(params);
    // यह अपलोड URL 15 मिनट (900 सेकंड) के लिए वैध रहेगा
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return { uploadUrl, key };
  } catch (err) {
    console.error("Error creating presigned PUT URL:", err);
    throw err;
  }
};

// सभी फंक्शन को एक्सपोर्ट करना
module.exports = { 
  uploadFileToWasabi, 
  getPresignedUrl,
  generateUploadUrl
};
