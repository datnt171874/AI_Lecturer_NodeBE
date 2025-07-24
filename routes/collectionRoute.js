const express = require('express');
const router = express.Router();
const lessonController = require('../controllers/lessonController');
const collectionController = require('../controllers/collectionController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.post('/',authenticate, collectionController.addToCollection);
router.get('/',authenticate, collectionController.getCollection);
router.delete('/:collectionId', authenticate, collectionController.deleteFromCollection);
module.exports = router;