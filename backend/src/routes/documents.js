const express = require('express');
const router = express.Router();
const { uploadDocument, getDocuments, getDocument, downloadDocument, deleteDocument } = require('../controllers/documentsController');
const { authenticate, authorizeProfile } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);

router.post('/upload', upload.single('document'), uploadDocument);
router.get('/profile/:profileId', authorizeProfile, getDocuments);
router.get('/:documentId', getDocument);
router.get('/:documentId/download', downloadDocument);
router.delete('/:documentId', deleteDocument);

module.exports = router;
