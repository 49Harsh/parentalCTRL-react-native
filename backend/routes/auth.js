const express = require('express');
const router = express.Router();
const {register, login, me, logout} = require('../controllers/authController');
const {authenticate} = require('../middleware/auth');

// POST /api/auth/register - Register new user
router.post('/register', register);

// POST /api/auth/login - Login user
router.post('/login', login);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);

module.exports = router;
