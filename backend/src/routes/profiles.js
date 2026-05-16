const express = require('express');
const router = express.Router();
const { getProfiles, getProfile, createProfile, updateProfile, deleteProfile, uploadAvatar } = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/', getProfiles);
router.post('/', createProfile);
router.get('/:profileId', getProfile);
router.put('/:profileId', updateProfile);
router.delete('/:profileId', deleteProfile);
router.post('/:profileId/avatar', upload.single('avatar'), uploadAvatar);

module.exports = router;
