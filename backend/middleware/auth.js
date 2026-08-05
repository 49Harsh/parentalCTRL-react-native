const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const header = req.get('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({success: false, message: 'Authentication required'});
    }

    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('-password');
    if (!user || !user.isActive || user.tokenVersion !== (payload.tokenVersion || 0)) {
      return res.status(401).json({success: false, message: 'Session is no longer valid'});
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({success: false, message: 'Invalid or expired session'});
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({success: false, message: 'You are not allowed to perform this action'});
  }
  next();
};

module.exports = {authenticate, requireRole};
