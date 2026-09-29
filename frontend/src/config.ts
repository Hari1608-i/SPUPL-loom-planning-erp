// API_BASE_URL is set at build time from VITE_API_BASE_URL in .env
// Production: https://loomplanning.santhiprocessing.com/api (set in frontend/.env)
// Development: falls back to '' (relative URL — Vite dev-server proxies /api/* to localhost:3002)
export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';
