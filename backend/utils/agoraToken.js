const { RtcTokenBuilder, RtcRole } = require('agora-token');

/**
 * Generate Agora RTC token for video/audio streaming
 * @param {string} channelName - The channel name (using uniqueId)
 * @param {number} uid - User ID (0 for auto-assign)
 * @param {string} role - 'publisher' or 'subscriber'
 * @returns {object} Token and expiration info
 */
const generateAgoraToken = (channelName, uid = 0, role = 'subscriber') => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  
  if (!appId || !appCertificate) {
    throw new Error('Agora credentials not configured');
  }

  // Token expiration time: 24 hours from now
  const expirationTimeInSeconds = 86400; // 24 hours
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  // Determine role
  const userRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  // Generate token
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    userRole,
    privilegeExpiredTs
  );

  return {
    token,
    appId,
    channel: channelName,
    uid,
    expiresAt: privilegeExpiredTs
  };
};

/**
 * Generate token for client (broadcaster/publisher)
 * @param {string} uniqueId - User's unique ID (used as channel name)
 * @returns {object} Token info
 */
const generateClientToken = (uniqueId) => {
  return generateAgoraToken(uniqueId, 0, 'publisher');
};

/**
 * Generate token for admin (subscriber)
 * @param {string} uniqueId - User's unique ID (used as channel name)
 * @returns {object} Token info
 */
const generateAdminToken = (uniqueId) => {
  return generateAgoraToken(uniqueId, 0, 'subscriber');
};

module.exports = {
  generateAgoraToken,
  generateClientToken,
  generateAdminToken
};
