const app = require('../backend/upload_server.js');

module.exports = async (req, res) => {
  return app(req, res);
};