const router = require('express').Router();
const upload = require('../middleware/upload');
const { getDocuments, uploadDocument, deleteDocument } = require('../controllers/documents.controller');
router.get('/', getDocuments);
router.post('/', upload.single('file'), uploadDocument);
router.delete('/:id', deleteDocument);
module.exports = router;
