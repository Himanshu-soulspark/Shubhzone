const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
app.use(cors());

// Environment Variables से Keys लेना
const wasabiAccessKey = process.env.WASABI_ACCESS_KEY;
const wasabiSecretKey = process.env.WASABI_SECRET_KEY;
const wasabiRegion = process.env.WASABI_REGION;
const wasabiBucket = process.env.WASABI_BUCKET_NAME;
const bunnyPullZoneUrl = process.env.BUNNY_PULL_ZONE_URL;

// Wasabi S3 Client
const s3 = new S3Client({
    credentials: {
        accessKeyId: wasabiAccessKey,
        secretAccessKey: wasabiSecretKey,
    },
    endpoint: `https://s3.${wasabiRegion}.wasabisys.com`,
    region: wasabiRegion,
});

const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = req.file;
    const type = req.body.type || 'uploads';
    const uid = req.body.uid || 'unknown';
    const fileName = `${type}/${uid}/${Date.now()}_${file.originalname}`;

    const params = {
        Bucket: wasabiBucket,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
    };

    try {
        const command = new PutObjectCommand(params);
        await s3.send(command);
        
        const publicUrl = `${bunnyPullZoneUrl}/${fileName}`;
        
        res.status(200).json({
            message: "File uploaded successfully!",
            url: publicUrl,
        });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: 'Failed to upload file.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
