const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const serverFile = path.join(root, "backend", "upload_server.js");

console.log("");
console.log("============================================================");
console.log("SPUPL EXPRESS HANDLER ORDER FIX");
console.log("============================================================");

if (!fs.existsSync(serverFile)) {
  throw new Error("backend/upload_server.js not found.");
}

const backupFile =
  serverFile +
  ".backup-before-handler-order-fix-" +
  Date.now();

fs.copyFileSync(serverFile, backupFile);

console.log("");
console.log("Backup created:");
console.log(backupFile);

let source = fs.readFileSync(serverFile, "utf8");

/*
 * Remove the GLOBAL ERROR HANDLER from its current position.
 * It must be after all normal routes.
 */
const globalErrorRegex =
  /\/\/ ----------------------------------------------------\r?\n\/\/ GLOBAL ERROR HANDLER\r?\n\/\/ ----------------------------------------------------\r?\n\r?\napp\.use\(\s*\r?\n\s*\(err, req, res, next\) => \{\s*\r?\n\s*res\.status\(500\)\.json\(\{\s*\r?\n\s*success: false,\s*\r?\n\s*error:\s*\r?\n\s*err\.message \|\|\s*\r?\n\s*'Internal Server Error'\s*\r?\n\s*\}\);\s*\r?\n\s*\}\s*\r?\n\);/m;

const globalErrorMatch = source.match(globalErrorRegex);

if (!globalErrorMatch) {
  console.log("");
  console.log("GLOBAL ERROR HANDLER block not found.");
  console.log("Restoring backup.");

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

const globalErrorBlock = globalErrorMatch[0];

source = source.replace(globalErrorRegex, "");

/*
 * Remove the API 404 HANDLER from its current position.
 */
const notFoundRegex =
  /\/\/ ----------------------------------------------------\r?\n\/\/ API 404 HANDLER\r?\n\/\/ ----------------------------------------------------\r?\n\r?\napp\.use\(\s*\r?\n\s*\(req, res\) => \{\s*\r?\n\s*res\.status\(404\)\.json\(\{\s*\r?\n\s*success: false,\s*\r?\n\s*error:\s*\r?\n\s*`API endpoint \$\{req\.method\} \$\{req\.url\} not found`\s*\r?\n\s*\}\);\s*\r?\n\s*\}\s*\r?\n\);/m;

const notFoundMatch = source.match(notFoundRegex);

if (!notFoundMatch) {
  console.log("");
  console.log("API 404 HANDLER block not found.");
  console.log("Restoring backup.");

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

const notFoundBlock = notFoundMatch[0];

source = source.replace(notFoundRegex, "");

/*
 * Find the final app.listen().
 */
const listenIndex = source.lastIndexOf("app.listen(");

if (listenIndex === -1) {
  console.log("");
  console.log("app.listen() not found.");
  console.log("Restoring backup.");

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

/*
 * Correct Express order:
 *
 * 1. All normal API routes
 * 2. API 404 handler
 * 3. Global error handler
 * 4. app.listen()
 */
const handlersAtBottom = `

// ----------------------------------------------------
// API 404 HANDLER
// ----------------------------------------------------

${notFoundBlock
  .replace(
    `// ----------------------------------------------------\r\n// API 404 HANDLER\r\n// ----------------------------------------------------\r\n\r\n`,
    ""
  )
  .replace(
    `// ----------------------------------------------------\n// API 404 HANDLER\n// ----------------------------------------------------\n\n`,
    ""
  )
}

// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

${globalErrorBlock
  .replace(
    `// ----------------------------------------------------\r\n// GLOBAL ERROR HANDLER\r\n// ----------------------------------------------------\r\n\r\n`,
    ""
  )
  .replace(
    `// ----------------------------------------------------\n// GLOBAL ERROR HANDLER\n// ----------------------------------------------------\n\n`,
    ""
  )}

`;

source =
  source.slice(0, listenIndex) +
  handlersAtBottom +
  source.slice(listenIndex);

fs.writeFileSync(serverFile, source, "utf8");

console.log("");
console.log("Handlers moved to the bottom of the API routes.");

console.log("");
console.log("Running syntax check...");

try {
  execFileSync(
    process.execPath,
    ["--check", serverFile],
    {
      cwd: root,
      stdio: "inherit"
    }
  );

  console.log("");
  console.log("SYNTAX CHECK: PASS");
} catch (error) {
  console.log("");
  console.log("SYNTAX CHECK: FAILED");
  console.log("Restoring original file...");

  fs.copyFileSync(backupFile, serverFile);

  console.log("Original file restored.");

  process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("EXPRESS HANDLER ORDER FIX COMPLETE");
console.log("============================================================");