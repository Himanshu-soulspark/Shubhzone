const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

// Wasabi क्रेडेंशियल्स और रीजन को Environment Variables से लेना
const wasabiRegion = process.env.WASABI_REGION;
const wasabiAccessKey = process.env.WASABI_ACCESS_KEY;
const wasabiSecretKey = process.env.WASABI_SECRET_KEY;
const wasabiBucketName = process.env.WASABI_BUCKET_NAME;

// Wasabi के लिए S3 Client बनाना
// यह सुनिश्चित करें कि आपका रीजन सही है, जैसे 'ap-northeast-1', 'us-east-1', etc.
const s3Client = new S3Client({
  region: wasabiRegion,
  endpoint: `https://s3.${wasabiRegion}.wasabisys.com`,
  credentials: {
    accessKeyId: wasabiAccessKey,
    secretAccessKey: wasabiSecretKey,
  },
});

/**
 * यह फंक्शन एक फ़ाइल को Wasabi बकेट में अपलोड करता है
 * @param {object} file - Multer द्वारा दिया गया फ़ाइल ऑब्जेक्ट
 * @returns {Promise<object>} - Wasabi से मिला अपलोड का रिजल्ट
 */
const uploadFileToWasabi = async (file) => {
  // फ़ाइल को पढ़ने के लिए एक stream बनाना
  const fileStream = fs.createReadStream(file.path);

  // Wasabi पर अपलोड करने के लिए पैरामीटर्स तैयार करना
  const uploadParams = {
    Bucket: wasabiBucketName,
    // भविष्य में, फ़ाइल का नाम यूनिक बनाने के लिए हम इसमें timestamp या UUID जोड़ सकते हैं
    // ताकि एक ही नाम की दो फ़ाइलें एक दूसरे पर ओवरराइट न हों
    Key: `${Date.now()}_${file.originalname}`,
    Body: fileStream,
    ContentType: file.mimetype // फ़ाइल का mime-type सेट करना (जैसे video/mp4)
  };

  try {
    // PutObjectCommand का उपयोग करके फ़ाइल अपलोड करना
    const command = new PutObjectCommand(uploadParams);
    const data = await s3Client.send(command);
    console.log("Wasabi upload successful:", data);
    
    // Wasabi पर फ़ाइल का पूरा URL बनाकर रिटर्न करना
    const fileUrl = `https://${wasabiBucketName}.s3.${wasabiRegion}.wasabisys.com/${uploadParams.Key}`;

    return { success: true, url: fileUrl, key: uploadParams.Key };
  } catch (err) {
    console.error("Error uploading to Wasabi:", err);
    return { success: false, error: err };
  }
};

// इस फंक्शन को एक्सपोर्ट करना ताकि index.js में इस्तेमाल हो सके
module.exports = { uploadFileToWasabi };
