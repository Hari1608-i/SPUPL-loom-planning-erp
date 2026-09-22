export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL !== undefined 
  ? (import.meta as any).env.VITE_API_BASE_URL 
  : "";

export default API_BASE_URL;