const express = require('express');
const router = express.Router();
const { 
  verifyUniqueId, 
  getAdminToken, 
  getClientToken 
} = require('../controllers/streamController');

// GET /api/stream/verify/:uniqueId - Verify if unique ID exists
router.get('/verify/:uniqueId', verifyUniqueId);

// GET /api/stream/token/admin/:uniqueId - Get Agora token for admin (subscriber)
router.get('/token/admin/:uniqueId', getAdminToken);

// GET /api/stream/token/client/:uniqueId - Get Agora token for client (publisher)
router.get('/token/client/:uniqueId', getClientToken);

module.exports = router;
