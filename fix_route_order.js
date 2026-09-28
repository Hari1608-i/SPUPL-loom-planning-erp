const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'backend', 'upload_server.js');

let source = fs.readFileSync(file, 'utf8');

console.log('===== SPUPL EXPRESS ROUTE ORDER REPAIR =====');

const backup = `${file}.backup-before-route-order-${Date.now()}`;
fs.copyFileSync(file, backup);
console.log('Backup:', backup);

// ------------------------------------------------------------
// EXACT 404 HANDLER CURRENTLY BLOCKING LATER ROUTES
// ------------------------------------------------------------
const notFoundRegex = /app\.use\(\s*\(req,\s*res\)\s*=>\s*\{\s*res\.status\(404\)\.json\(\{\s*success:\s*false,\s*error:\s*`API endpoint \$\{req\.method\} \$\{req\.url\} not found`\s*\}\);\s*\}\s*\);/m;

// ------------------------------------------------------------
// GLOBAL ERROR HANDLER
// ------------------------------------------------------------
const globalErrorRegex = /app\.use\(\s*\(err,\s*req,\s*res,\s*next\)\s*=>\s*\{\s*res\.status\(500\)\.json\(\{\s*success:\s*false,\s*error:\s*err\.message \|\|\s*'Internal Server Error'\s*\}\);\s*\}\s*\);/m;

const notFoundMatch = source.match(notFoundRegex);
const globalErrorMatch = source.match(globalErrorRegex);

if (!notFoundMatch) {
  throw new Error('404 handler was not found. No change made.');
}

if (!globalErrorMatch) {
  throw new Error('Global error handler was not found. No change made.');
}

const notFoundHandler = notFoundMatch[0];
const globalErrorHandler = globalErrorMatch[0];

console.log('404 handler: FOUND');
console.log('Global error handler: FOUND');

// Remove both handlers from their current positions.
source = source.replace(notFoundRegex, '');
source = source.replace(globalErrorRegex, '');

// Clean excessive blank lines created by removal.
source = source.replace(/\n{5,}/g, '\n\n\n');

// ------------------------------------------------------------
// FIND THE REAL END OF THE ROUTE DEFINITIONS
// Put 404 + error handler immediately BEFORE app.listen()
// ------------------------------------------------------------
const listenIndex = source.lastIndexOf("app.listen(");

if (listenIndex === -1) {
  throw new Error('app.listen() was not found. No change made.');
}

console.log('app.listen() found at character position:', listenIndex);

const finalHandlers = `

// ============================================================
// FINAL EXPRESS FALLBACK HANDLERS
// IMPORTANT: THESE MUST REMAIN AFTER ALL API ROUTES
// ============================================================

${notFoundHandler}

${globalErrorHandler}

`;

source =
  source.slice(0, listenIndex) +
  finalHandlers +
  source.slice(listenIndex);

fs.writeFileSync(file, source, 'utf8');

console.log('');
console.log('SUCCESS: 404 HANDLER MOVED TO END');
console.log('SUCCESS: GLOBAL ERROR HANDLER MOVED TO END');
console.log('SUCCESS: ALL API ROUTES NOW COME BEFORE FALLBACK HANDLERS');
console.log('');
console.log('File repaired:', file);