const router = require('express').Router();
const upload = require('../middleware/upload');
const { getDocuments, uploadDocument, deleteDocument, reanalyzeDocument } = require('../controllers/documents.controller');
router.get('/', getDocuments);
router.post('/', upload.single('file'), uploadDocument);
router.delete('/:id', deleteDocument);
router.post('/:id/reanalyze', reanalyzeDocument);
module.exports = router;
