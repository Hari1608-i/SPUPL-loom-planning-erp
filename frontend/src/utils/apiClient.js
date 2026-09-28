import axios from 'axios';

/*
 * SPUPL ERP API Client
 *
 * Production:
 *   Uses relative /api/... paths so the deployed Vercel application
 *   calls the API from the same domain.
 *
 * Local development:
 *   Also uses relative /api/... paths.
 *   Configure the existing Vite development proxy to forward /api
 *   to the local backend if required.
 */

const API = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

API.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('spupl_token');

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default API;