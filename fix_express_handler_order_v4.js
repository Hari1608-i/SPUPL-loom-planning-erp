const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const SERVER = path.join(ROOT, "backend", "upload_server.js");

console.log("");
console.log("============================================================");
console.log("SPUPL EXPRESS HANDLER ORDER FIX V4");
console.log("============================================================");

if (!fs.existsSync(SERVER)) {
  console.error("ERROR: backend/upload_server.js not found.");
  process.exit(1);
}

const BACKUP =
  SERVER +
  ".backup-before-handler-order-fix-v4-" +
  Date.now();

fs.copyFileSync(SERVER, BACKUP);

console.log("");
console.log("Backup:");
console.log(BACKUP);

let source = fs.readFileSync(SERVER, "utf8");

source = source
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

/*
==============================================================
1. FIND API 404 HANDLER
==============================================================
*/

const api404Regex =
  /app\.use\(\s*\(req,\s*res\)\s*=>\s*\{\s*res\.status\(404\)\.json\(\{\s*success:\s*false,\s*error:\s*`API endpoint \$\{req\.method\} \$\{req\.url\} not found`\s*\}\);\s*\}\s*\);/m;

const api404Matches = source.match(api404Regex);

if (!api404Matches || api404Matches.length !== 1) {
  console.error("");
  console.error(
    "ERROR: Expected exactly one API 404 handler, but did not find exactly one."
  );
  console.error("NO FILE CHANGES MADE.");

  fs.copyFileSync(BACKUP, SERVER);
  process.exit(1);
}

const api404Block = api404Matches[0];

console.log("");
console.log("API 404 HANDLER: FOUND");

/*
==============================================================
2. FIND GLOBAL ERROR HANDLER
==============================================================
*/

const globalErrorRegex =
  /app\.use\(\s*\(err,\s*req,\s*res,\s*next\)\s*=>\s*\{\s*res\.status\(500\)\.json\(\{\s*success:\s*false,\s*error:\s*err\.message\s*\|\|\s*'Internal Server Error'\s*\}\);\s*\}\s*\);/m;

const globalMatches = source.match(globalErrorRegex);

if (!globalMatches || globalMatches.length !== 1) {
  console.error("");
  console.error(
    "ERROR: Expected exactly one Global Error Handler, but did not find exactly one."
  );
  console.error("NO FILE CHANGES MADE.");

  fs.copyFileSync(BACKUP, SERVER);
  process.exit(1);
}

const globalErrorBlock = globalMatches[0];

console.log("GLOBAL ERROR HANDLER: FOUND");

/*
==============================================================
3. REMOVE ONLY THE TWO FUNCTIONAL HANDLER BLOCKS
==============================================================
*/

source = source.replace(api404Regex, "");
source = source.replace(globalErrorRegex, "");

console.log("");
console.log("Old handler positions removed.");

/*
==============================================================
4. FIND FINAL app.listen(
==============================================================
*/

const listenIndex = source.lastIndexOf("app.listen(");

if (listenIndex === -1) {
  console.error("");
  console.error("ERROR: app.listen() was not found.");
  console.error("Restoring backup.");

  fs.copyFileSync(BACKUP, SERVER);
  process.exit(1);
}

console.log(
  "app.listen() found at character:",
  listenIndex
);

/*
==============================================================
5. INSERT HANDLERS IMMEDIATELY BEFORE app.listen()

Correct Express order:

ALL ROUTES
   ↓
404 HANDLER
   ↓
GLOBAL ERROR HANDLER
   ↓
app.listen()
==============================================================
*/

const finalHandlers = `

// ----------------------------------------------------
// API 404 HANDLER
// ----------------------------------------------------

${api404Block}

// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

${globalErrorBlock}

`;

source =
  source.slice(0, listenIndex) +
  finalHandlers +
  source.slice(listenIndex);

/*
==============================================================
6. WRITE FILE
==============================================================
*/

fs.writeFileSync(SERVER, source, "utf8");

console.log("");
console.log("Handlers moved to the bottom of the route definitions.");

/*
==============================================================
7. SYNTAX CHECK
==============================================================
*/

console.log("");
console.log("------------------------------------------------------------");
console.log("SYNTAX CHECK");
console.log("------------------------------------------------------------");

try {
  execFileSync(
    process.execPath,
    ["--check", SERVER],
    {
      cwd: ROOT,
      stdio: "inherit"
    }
  );

  console.log("");
  console.log("SYNTAX CHECK: PASS");
} catch (error) {
  console.error("");
  console.error("SYNTAX CHECK: FAILED");
  console.error("Restoring backup...");

  fs.copyFileSync(BACKUP, SERVER);

  console.error("Original file restored.");
  process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("FIX COMPLETE");
console.log("============================================================");
console.log("");
console.log("Correct order is now:");
console.log("  1. All API routes");
console.log("  2. API 404 handler");
console.log("  3. Global error handler");
console.log("  4. app.listen()");
console.log("");
console.log("Backup kept safely at:");
console.log(BACKUP);
console.log("");