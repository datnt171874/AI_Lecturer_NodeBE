const express = require('express');
const router = express.Router();
const lessonController = require('../controllers/lessonController');
const {authenticate, authorize} = require('../middlewares/authMiddleware');


router.post('/', authenticate, lessonController.createLessonWithText);
// router.get('/:id',  lessonController.getLesson);
// router.put('/:id',  lessonController.updateLesson);
// router.delete('/:id', lessonController.deleteLesson);

module.exports = router;