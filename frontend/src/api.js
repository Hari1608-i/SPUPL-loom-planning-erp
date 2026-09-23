import axios from 'axios';

// Force an empty string base URL so all requests use relative paths (/api/...) on Vercel
const API = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token automatically if available
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default API;