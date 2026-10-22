const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
} catch (e) {}

const app = require('../backend/upload_server.js');

module.exports = async (req, res) => {
  try {
    const query = req.query || {};

    let rewrittenPath = query.path;

    if (Array.isArray(rewrittenPath)) {
      rewrittenPath = rewrittenPath.join('/');
    }

    if (rewrittenPath !== undefined && rewrittenPath !== null) {
      let pathValue = String(rewrittenPath).trim();

      if (!pathValue || pathValue === 'index' || pathValue === 'index.js') {
        pathValue = '/api';
      } else {
        if (!pathValue.startsWith('/')) {
          pathValue = '/' + pathValue;
        }

        if (!pathValue.startsWith('/api/')) {
          pathValue = '/api' + pathValue;
        }

        if (pathValue === '/api/index' || pathValue === '/api/index.js' || pathValue === '/api/index/') {
          pathValue = '/api';
        }
      }

      const remainingQuery = new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (key === 'path') continue;

        if (Array.isArray(value)) {
          for (const item of value) {
            remainingQuery.append(key, String(item));
          }
        } else if (value !== undefined && value !== null) {
          remainingQuery.append(key, String(value));
        }
      }

      const queryString = remainingQuery.toString();

      req.url = queryString
        ? `${pathValue}?${queryString}`
        : pathValue;
    } else {
      const rawUrl = req.originalUrl || req.url || '/api';
      if (rawUrl.startsWith('/api/index.js') || rawUrl.startsWith('/api/index')) {
        const cleaned = rawUrl.replace(/^\/api\/index(\.js)?/, '/api');
        req.url = cleaned || '/api';
      } else if (!req.url || req.url === '/' || req.url === '/api/index.js') {
        if (req.originalUrl && req.originalUrl.startsWith('/api')) {
          req.url = req.originalUrl;
        } else {
          req.url = '/api';
        }
      }
    }

    return app(req, res);
  } catch (error) {
    console.error('VERCEL API BRIDGE ERROR:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message || 'API bridge error'
      });
    }

    return res.end();
  }
};