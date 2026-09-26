const app = require('../backend/upload_server.js');

module.exports = (req, res) => {
  return app(req, res);
};