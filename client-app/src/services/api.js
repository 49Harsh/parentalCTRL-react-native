import axios from 'axios';

// For Android Emulator, use 10.0.2.2 to access localhost
// For real device, use your computer's IP address
const API_BASE_URL = 'http://10.0.2.2:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Register new user
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise} Response with user data and token
 */
export const register = async (name, email, password) => {
  try {
    const response = await api.post('/api/auth/register', {
      name,
      email,
      password,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || {message: 'Network error occurred'};
  }
};

/**
 * Login user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise} Response with user data and token
 */
export const login = async (email, password) => {
  try {
    const response = await api.post('/api/auth/login', {
      email,
      password,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || {message: 'Network error occurred'};
  }
};

/**
 * Get Agora token for client to start broadcasting
 * @param {string} uniqueId - User's unique ID
 * @returns {Promise} Response with token and channel info
 */
export const getClientToken = async uniqueId => {
  try {
    const response = await api.get(`/api/stream/token/client/${uniqueId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || {message: 'Network error occurred'};
  }
};

export default api;
