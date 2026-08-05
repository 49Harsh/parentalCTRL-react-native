const express = require('express');
const {verifyDevice, getAdminToken, getClientToken} = require('../controllers/streamController');
const {authenticate, requireRole} = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('parent'));
router.get('/verify/:deviceId', verifyDevice);
router.get('/token/admin/:deviceId', getAdminToken);
router.get('/token/client/:deviceId', getClientToken);

module.exports = router;
