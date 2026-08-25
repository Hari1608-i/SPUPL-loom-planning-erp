const app = require('../backend/upload_server');

module.exports = (req, res) => {
  // Ensure the route always includes /api prefix so upload_server routes match
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};