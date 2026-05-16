const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const uploadDir = process.env.UPLOADS_PATH || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadDir, req.user?.id || 'tmp');
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${crypto.randomUUID()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(pdf|jpg|jpeg|png|webp)$/i;
  if (allowed.test(path.extname(file.originalname))) cb(null, true);
  else cb(new Error('Only PDF and image files are allowed'), false);
};

const maxSizeMB = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '20');

const upload = multer({ storage, fileFilter, limits: { fileSize: maxSizeMB * 1024 * 1024 } });

module.exports = upload;
