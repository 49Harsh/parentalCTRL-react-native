import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// For Android Emulator, use 10.0.2.2 to access localhost
// For real device, use your computer's IP address
const API_BASE_URL = 'http://10.0.2.2:5000'; // Use your computer's LAN IP instead when testing on a physical device.

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {'Content-Type': 'application/json'},
});

const getApiError = error => {
  if (error.response?.data) {
    return error.response.data;
  }

  if (error.code === 'ECONNABORTED') {
    return {
      message:
        'The server took too long to respond. Make sure the backend and MongoDB are running.',
    };
  }

  return {
    message: `Cannot connect to the server at ${API_BASE_URL}. Make sure the backend is running and the app is using the correct emulator/device address.`,
  };
};

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
    throw getApiError(error);
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
    throw getApiError(error);
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
    throw getApiError(error);
  }
};

export const sendHeartbeat = async (deviceId, status) => {
  try {
    const response = await api.post(`/api/devices/${deviceId}/heartbeat`, status);
    return response.data;
  } catch (error) {
    throw getApiError(error);
  }
};

export const approveLiveSession = async (deviceId, requestId) => {
  try {
    const response = await api.post(`/api/devices/${deviceId}/live-session/approve`, {requestId});
    return response.data;
  } catch (error) {
    throw getApiError(error);
  }
};

export const getClientToken = async deviceId => {
  try {
    const response = await api.get(`/api/stream/token/client/${deviceId}`);
    return response.data;
  } catch (error) {
    throw getApiError(error);
  }
};

export default api;
