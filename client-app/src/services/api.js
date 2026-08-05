import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// For Android Emulator, use 10.0.2.2 to access localhost
// For real device, use your computer's IP address
const API_BASE_URL = 'http://10.0.2.2:5000'; // Override per build environment for physical/staging devices.

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {'Content-Type': 'application/json'},
});

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
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
export const enrollDevice = async name => {
  try {
    const response = await api.post('/api/devices/enroll', {name});
    return response.data;
  } catch (error) {
    throw error.response?.data || {message: 'Network error occurred'};
  }
};

export const sendHeartbeat = async (deviceId, status) => {
  try {
    const response = await api.post(`/api/devices/${deviceId}/heartbeat`, status);
    return response.data;
  } catch (error) {
    throw error.response?.data || {message: 'Network error occurred'};
  }
};

export const getClientToken = async deviceId => {
  try {
    const response = await api.get(`/api/stream/token/client/${deviceId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || {message: 'Network error occurred'};
  }
};

export default api;
