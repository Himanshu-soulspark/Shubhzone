const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require("fs"); // यह अभी भी यहाँ है, हालाँकि डायरेक्ट अपलोड में इसका उपयोग नहीं होता।

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
 * [अब उपयोग में नहीं] यह फंक्शन सर्वर के माध्यम से एक फ़ाइल अपलोड करता था।
 * इसे रेफरेंस के लिए रखा गया है।
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
    await s3Client.send(command);
    return { success: true, key: uploadParams.Key };
  } catch (err) {
    console.error("Error uploading to Wasabi (old method):", err);
    return { success: false, error: err };
  }
};


/**
 * यह फंक्शन एक वीडियो के लिए एक अस्थायी, सुरक्षित प्लेबैक URL जेनरेट करता है।
 * @param {string} key - Wasabi में फ़ाइल का नाम (Key)।
 * @returns {Promise<string>} - प्री-साइन्ड URL जो कुछ समय के लिए वैध होता है।
 */
const getPresignedUrl = async (key) => {
  const params = {
    Bucket: wasabiBucketName,
    Key: key,
  };
  
  try {
    const command = new GetObjectCommand(params);
    // यह URL 15 मिनट (900 सेकंड) के लिए वीडियो चलाने के लिए वैध रहेगा।
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return signedUrl;
  } catch (err) {
    console.error("Error creating presigned playback URL:", err);
    throw err;
  }
};


/**
 * [नया और तेज़ तरीका] यह फंक्शन एक सुरक्षित, अस्थायी अपलोड URL जेनरेट करता है।
 * फ्रंटएंड इस URL का उपयोग करके फ़ाइल को सीधे Wasabi पर भेजता है।
 * @param {string} fileName - अपलोड की जाने वाली फ़ाइल का मूल नाम।
 * @returns {Promise<object>} - जिसमें uploadUrl और उस फ़ाइल के लिए यूनिक Key होती है।
 */
const generateUploadUrl = async (fileName) => {
  // एक यूनिक की (Key) बनाना ताकि फाइलें एक दूसरे पर ओवरराइट न हों।
  const key = `${Date.now()}_${fileName.replace(/\s+/g, '_')}`; // स्पेस को अंडरस्कोर से बदलें

  const params = {
    Bucket: wasabiBucketName,
    Key: key,
  };

  try {
    // यह PutObject के लिए एक प्री-साइन्ड URL बनाएगा।
    const command = new PutObjectCommand(params);
    // यह URL 15 मिनट (900 सेकंड) के लिए फ़ाइल अपलोड करने के लिए वैध रहेगा।
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return { uploadUrl, key };
  } catch (err) {
    console.error("Error creating presigned upload URL:", err);
    throw err;
  }
};


// सभी जरूरी फंक्शन्स को एक्सपोर्ट करना।
module.exports = {
  uploadFileToWasabi, // रेफरेंस के लिए
  getPresignedUrl,
  generateUploadUrl
};
