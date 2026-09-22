// Production-ready API Base URL Config
export const API_BASE_URL = (() => {
  // If explicitly defined via environment variable, use it
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }
  
  // When running on Vercel or production browser, use relative path so requests route to /api/index.js correctly
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '';
  }
  
  // Local development fallback
  return '';
})();

export default API_BASE_URL;