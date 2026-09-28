import axios from 'axios';

const API = axios.create({
  baseURL: window.location.origin.includes('localhost') ? 'http://localhost:3002' : '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('spupl_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default API;