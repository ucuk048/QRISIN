// Standalone HTTP Server untuk VPS, PM2, Docker, Pterodactyl, cPanel, atau Local Dev.
// Menggunakan stdlib node:http murni tanpa dependensi framework tambahan (ponytail principle).
const http = require('http');
const handler = require('./api/index');
const logger = require('./lib/logger');

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = http.createServer((req, res) => {
  handler(req, res);
});

server.listen(PORT, () => {
  const msg = `Gateway running on port ${PORT} (http://localhost:${PORT})`;
  console.log(`[SERVER] ${msg}`);
  logger.logEvent('INFO', msg);
});

module.exports = server;
