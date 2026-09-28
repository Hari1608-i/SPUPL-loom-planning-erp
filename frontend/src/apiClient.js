import axios from 'axios';

// Configure global baseURL dynamically so it never points to localhost in production
axios.defaults.baseURL = ''; 

const apiClient = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Ensure absolute localhost URLs are converted to relative proxy paths on Vercel
  if (config.url && config.url.startsWith('http://localhost:3002')) {
    config.url = config.url.replace('http://localhost:3002', '');
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default apiClient;
// Add inside your API response handler
if (typeof response.data === 'string' && response.data.trim().startsWith('<')) {
  throw new Error("Server error: Received HTML instead of JSON. Check backend server logs.");
}