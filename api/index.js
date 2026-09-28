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

      if (!pathValue) {
        pathValue = '/api';
      } else {
        if (!pathValue.startsWith('/')) {
          pathValue = '/' + pathValue;
        }

        if (!pathValue.startsWith('/api/')) {
          pathValue = '/api' + pathValue;
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
    } else if (
      req.url === '/api/index' ||
      req.url === '/api/index/'
    ) {
      req.url = '/api';
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