import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Verify if a unique ID exists and is valid
 * @param {string} uniqueId - The 10-character unique ID
 * @returns {Promise} Response with user data
 */
export const verifyUniqueId = async (uniqueId) => {
  try {
    const response = await api.get(`/api/stream/verify/${uniqueId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Network error occurred' };
  }
};

/**
 * Get Agora token for admin to connect to client stream
 * @param {string} uniqueId - The 10-character unique ID
 * @returns {Promise} Response with token and channel info
 */
export const getAdminToken = async (uniqueId) => {
  try {
    const response = await api.get(`/api/stream/token/admin/${uniqueId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Network error occurred' };
  }
};

export default api;
