const User = require('../models/User');

/**
 * Generates a random 10-character alphanumeric unique ID
 * @returns {string} 10-character random string
 */
const generateUniqueId = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let uniqueId = '';
  
  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    uniqueId += characters[randomIndex];
  }
  
  return uniqueId;
};

/**
 * Check if a unique ID already exists in the database
 * @param {string} uniqueId - The unique ID to check
 * @returns {Promise<boolean>} True if exists, false otherwise
 */
const checkUniqueIdExists = async (uniqueId) => {
  try {
    const user = await User.findOne({ uniqueId });
    return !!user;
  } catch (error) {
    console.error('Error checking unique ID:', error);
    throw error;
  }
};

/**
 * Generate a unique ID that doesn't exist in the database
 * @returns {Promise<string>} A unique 10-character ID
 */
const generateUniqueUniqueId = async () => {
  let uniqueId;
  let exists = true;
  
  // Keep generating until we get a unique ID
  while (exists) {
    uniqueId = generateUniqueId();
    exists = await checkUniqueIdExists(uniqueId);
  }
  
  return uniqueId;
};

module.exports = {
  generateUniqueId,
  checkUniqueIdExists,
  generateUniqueUniqueId
};
