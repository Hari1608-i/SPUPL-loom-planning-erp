const http = require('http');

// Start a temporary instance of your app server to test live routing
const app = require('./upload_server');
const PORT = 3999;
const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log('======================================================');
  console.log('   SPUPL ERP LIVE HTTP ENDPOINT & BUTTON AUDIT        ');
  console.log('======================================================\n');

  // List of all critical backend endpoints mapped to your 25+ ERP pages
  const endpoints = [
    '/api/system-health',
    '/api/looms',
    '/api/beam-stock',
    '/api/reed-stock',
    '/api/designs',
    '/api/orders',
    '/api/active-runs',
    '/api/completed-runs',
    '/api/planning/next-plans',
    '/api/production-logs',
    '/api/erp-alerts',
    '/api/users',
    '/api/warp-preparation/all',
    '/api/sizing/requests',
    '/api/daily-report'
  ];

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    await new Promise((resolve) => {
      http.get(`http://localhost:${PORT}${ep}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log(`[HTTP 200 OK]  ${ep.padEnd(35)} -> Valid JSON Response`);
              passed++;
            } else {
              console.log(`[HTTP ${res.statusCode}] ${ep.padEnd(35)} -> Status Check Failed`);
              failed++;
            }
          } catch (e) {
            console.log(`[JSON ERROR]  ${ep.padEnd(35)} -> Response was not valid JSON!`);
            failed++;
          }
          resolve();
        });
      }).on('error', (err) => {
        console.log(`[NETWORK ERR] ${ep.padEnd(35)} -> ${err.message}`);
        failed++;
        resolve();
      });
    });
  }

  console.log('\n======================================================');
  console.log(` HTTP SUMMARY: ${passed} Endpoints Passed, ${failed} Failed.`);
  if (failed === 0) {
    console.log(' ALL INTERNAL & EXTERNAL HTTP ENDPOINTS FULLY VERIFIED!');
  } else {
    console.log(' WARNING: Some HTTP routes returned non-200 responses.');
  }
  console.log('======================================================\n');

  server.close();
  process.exit(0);
});