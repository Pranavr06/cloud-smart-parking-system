/**
 * Detection Routes
 */
const express = require('express');
const router = express.Router();
const detectionController = require('../controllers/detectionController');
const { requireDetectionKey } = require('../middleware/authMiddleware');

router.post('/update', requireDetectionKey, detectionController.handleDetectionUpdate);
router.get('/history', detectionController.getHistory);

module.exports = router;
