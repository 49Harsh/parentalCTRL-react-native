const User = require('../models/User');
const { generateAdminToken, generateClientToken } = require('../utils/agoraToken');

/**
 * Verify if a unique ID exists and is active
 */
const verifyUniqueId = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    // Validation
    if (!uniqueId || uniqueId.length !== 10) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid unique ID format. Must be 10 characters.' 
      });
    }

    // Find user by unique ID
    const user = await User.findOne({ uniqueId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found with this unique ID' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: 'This account is inactive' 
      });
    }

    res.status(200).json({
      success: true,
      valid: true,
      user: {
        name: user.name,
        uniqueId: user.uniqueId
      }
    });

  } catch (error) {
    console.error('Verify unique ID error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during verification',
      error: error.message 
    });
  }
};

/**
 * Generate Agora token for admin to connect to client stream
 */
const getAdminToken = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    // Validation
    if (!uniqueId || uniqueId.length !== 10) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid unique ID format. Must be 10 characters.' 
      });
    }

    // Verify user exists and is active
    const user = await User.findOne({ uniqueId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found with this unique ID' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: 'This account is inactive' 
      });
    }

    // Generate Agora token for admin (subscriber)
    const tokenData = generateAdminToken(uniqueId);

    res.status(200).json({
      success: true,
      ...tokenData,
      user: {
        name: user.name,
        uniqueId: user.uniqueId
      }
    });

  } catch (error) {
    console.error('Get admin token error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while generating token',
      error: error.message 
    });
  }
};

/**
 * Generate Agora token for client to start broadcasting
 */
const getClientToken = async (req, res) => {
  try {
    const { uniqueId } = req.params;

    // Validation
    if (!uniqueId || uniqueId.length !== 10) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid unique ID format. Must be 10 characters.' 
      });
    }

    // Verify user exists and is active
    const user = await User.findOne({ uniqueId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found with this unique ID' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: 'This account is inactive' 
      });
    }

    // Generate Agora token for client (publisher)
    const tokenData = generateClientToken(uniqueId);

    res.status(200).json({
      success: true,
      ...tokenData
    });

  } catch (error) {
    console.error('Get client token error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while generating token',
      error: error.message 
    });
  }
};

module.exports = {
  verifyUniqueId,
  getAdminToken,
  getClientToken
};
