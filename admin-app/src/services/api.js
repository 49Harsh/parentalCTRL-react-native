import axios from 'axios';

const api = axios.create({baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', timeout: 15000});
api.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401) localStorage.removeItem('authToken');
  return Promise.reject(error.response?.data || {message: 'Network error occurred'});
});

export const register = data => api.post('/api/auth/register', data).then(r => r.data);
export const login = data => api.post('/api/auth/login', data).then(r => r.data);
export const getMe = () => api.get('/api/auth/me').then(r => r.data);
export const logout = () => api.post('/api/auth/logout').then(r => r.data);
export const listDevices = () => api.get('/api/devices').then(r => r.data);
export const enrollDevice = name => api.post('/api/devices/enroll', {name}).then(r => r.data);
export const getDevice = id => api.get(`/api/devices/${id}`).then(r => r.data);
export const updateDevice = (id, data) => api.patch(`/api/devices/${id}`, data).then(r => r.data);
export const revokeDevice = id => api.delete(`/api/devices/${id}`).then(r => r.data);
export const updatePolicy = (id, data) => api.put(`/api/devices/${id}/policy`, data).then(r => r.data);
export const getCommands = id => api.get(`/api/devices/${id}/commands`).then(r => r.data);
export const getCommand = (id, commandId) => api.get(`/api/devices/${id}/commands/${commandId}`).then(r => r.data);
export const sendCommand = (id, type, payload = {}) => api.post(`/api/devices/${id}/commands`, {type, payload}).then(r => r.data);
export const getLocations = id => api.get(`/api/devices/${id}/locations`).then(r => r.data);
export const getUsage = id => api.get(`/api/devices/${id}/usage`).then(r => r.data);
export const getNotifications = id => api.get(`/api/devices/${id}/notifications`).then(r => r.data);
export const getCallLogs = id => api.get(`/api/devices/${id}/call-logs`).then(r => r.data);
export const verifyUniqueId = id => api.get(`/api/stream/verify/${id}`).then(r => r.data);
export const getAdminToken = id => api.get(`/api/stream/token/admin/${id}`).then(r => r.data);
export const endLiveSession = id => api.post(`/api/devices/${id}/live-session/end`).then(r => r.data).catch(() => {});
export const grantPersistentAccess = id => api.post(`/api/devices/${id}/persistent-access/grant`).then(r => r.data);
export const revokePersistentAccess = id => api.post(`/api/devices/${id}/persistent-access/revoke`).then(r => r.data);
export const startScreenStreamCommand = (id, fps = 12) => api.post(`/api/devices/${id}/commands`, {type: 'SCREEN_STREAM_START', payload: {fps}}).then(r => r.data);
export const stopScreenStreamCommand = id => api.post(`/api/devices/${id}/commands`, {type: 'SCREEN_STREAM_STOP', payload: {}}).then(r => r.data);

// Polling-based screen capture: returns the latest frame from the relay.
export const pollScreenFrame = id => api.get(`/api/devices/${id}/last-frame`).then(r => r.data);

// Diagnostic info: subscriber count and last-frame metadata.
export const getScreenStreamStatus = id => api.get(`/api/devices/${id}/screen-status`).then(r => r.data);

export default api;
