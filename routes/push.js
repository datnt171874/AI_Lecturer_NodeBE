const express = require('express');
const router = express.Router();
const lessonController = require('../controllers/lessonController');
const { authenticate } = require('../middleware/authMiddleware');

router.get('/public-key', authenticate, (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe',authenticate, lessonController.savePushSubscription);
router.post('/notify', authenticate, lessonController.sendCustomNotification);

module.exports = router;