const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {authenticate, authorize} = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google-login', authController.googleLogin);
router.get('/user',authenticate, authController.getUser);
router.get('/users', authController.getAllUsers);

module.exports = router;