const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const serverFile = path.join(root, "backend", "upload_server.js");

console.log("");
console.log("============================================================");
console.log("SPUPL EXPRESS HANDLER ORDER FIX V2");
console.log("============================================================");

if (!fs.existsSync(serverFile)) {
  console.error("ERROR: backend/upload_server.js not found.");
  process.exit(1);
}

const backupFile =
  serverFile +
  ".backup-before-handler-order-fix-v2-" +
  Date.now();

fs.copyFileSync(serverFile, backupFile);

console.log("");
console.log("Backup created:");
console.log(backupFile);

let source = fs.readFileSync(serverFile, "utf8");

// Normalize line endings only for reliable editing.
source = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/*
==============================================================
HELPER
==============================================================
Find an app.use(...) block by locating a unique text inside it,
then finding the nearest preceding "app.use(" and the closing ");".
*/
function removeAppUseContaining(uniqueText, label) {
  const markerIndex = source.indexOf(uniqueText);

  if (markerIndex === -1) {
    console.log(`${label}: NOT FOUND`);
    return false;
  }

  const appUseIndex = source.lastIndexOf("app.use(", markerIndex);

  if (appUseIndex === -1) {
    throw new Error(
      `${label}: found marker but could not find preceding app.use(.`
    );
  }

  // Make sure this app.use is reasonably close to the marker.
  if (markerIndex - appUseIndex > 2000) {
    throw new Error(
      `${label}: matched app.use is too far from marker. Refusing unsafe edit.`
    );
  }

  const closeIndex = source.indexOf("\n);", markerIndex);

  if (closeIndex === -1) {
    throw new Error(
      `${label}: closing ); not found.`
    );
  }

  const endIndex = closeIndex + 3;

  const removed = source.slice(
    appUseIndex,
    endIndex
  );

  console.log("");
  console.log(`${label}: FOUND`);
  console.log("");
  console.log(
    removed
      .split("\n")
      .map(x => "  " + x)
      .join("\n")
  );

  source =
    source.slice(0, appUseIndex) +
    source.slice(endIndex);

  return true;
}

console.log("");
console.log("------------------------------------------------------------");
console.log("1. REMOVE API 404 HANDLER FROM CURRENT POSITION");
console.log("------------------------------------------------------------");

const removed404 =
  removeAppUseContaining(
    "API endpoint ${req.method} ${req.url} not found",
    "API 404 HANDLER"
  );

if (!removed404) {
  console.error("");
  console.error(
    "The API 404 handler was not found. No changes will be made."
  );

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

console.log("");
console.log("------------------------------------------------------------");
console.log("2. REMOVE GLOBAL ERROR HANDLER FROM CURRENT POSITION");
console.log("------------------------------------------------------------");

const removedGlobalError =
  removeAppUseContaining(
    "'Internal Server Error'",
    "GLOBAL ERROR HANDLER"
  );

if (!removedGlobalError) {
  console.error("");
  console.error(
    "The Global Error Handler was not found."
  );
  console.error(
    "Restoring backup to avoid partial modification."
  );

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

console.log("");
console.log("------------------------------------------------------------");
console.log("3. FIND app.listen()");
console.log("------------------------------------------------------------");

const listenIndex =
  source.lastIndexOf("app.listen(");

if (listenIndex === -1) {
  console.error("app.listen() not found.");
  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

console.log(
  "app.listen() found at character:",
  listenIndex
);

/*
==============================================================
NEW CORRECT EXPRESS ORDER
==============================================================

ALL NORMAL ROUTES
        ↓
API 404 HANDLER
        ↓
GLOBAL ERROR HANDLER
        ↓
app.listen()
*/
const bottomHandlers = `

// ----------------------------------------------------
// API 404 HANDLER
// ----------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: \`API endpoint \${req.method} \${req.url} not found\`
  });
});

// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

`;

source =
  source.slice(0, listenIndex) +
  bottomHandlers +
  source.slice(listenIndex);

// Ensure final file has standard newline style.
source = source.replace(/\n/g, "\r\n");

fs.writeFileSync(serverFile, source, "utf8");

console.log("");
console.log("------------------------------------------------------------");
console.log("4. JAVASCRIPT SYNTAX CHECK");
console.log("------------------------------------------------------------");

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
  console.error("");
  console.error("SYNTAX CHECK: FAILED");
  console.error("Restoring backup...");

  fs.copyFileSync(backupFile, serverFile);

  console.log("Original file restored.");

  process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("EXPRESS HANDLER ORDER FIX V2 COMPLETE");
console.log("============================================================");
console.log("");
console.log("Correct order is now:");
console.log("  1. All API routes");
console.log("  2. API 404 handler");
console.log("  3. Global error handler");
console.log("  4. app.listen()");
console.log("");
console.log("Backup:");
console.log(backupFile);
console.log("");