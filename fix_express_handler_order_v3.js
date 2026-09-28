const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const serverFile = path.join(root, "backend", "upload_server.js");

console.log("");
console.log("============================================================");
console.log("SPUPL EXPRESS HANDLER ORDER FIX V3");
console.log("============================================================");

if (!fs.existsSync(serverFile)) {
  console.error("ERROR: backend/upload_server.js not found.");
  process.exit(1);
}

const backupFile =
  serverFile +
  ".backup-before-handler-order-fix-v3-" +
  Date.now();

fs.copyFileSync(serverFile, backupFile);

console.log("");
console.log("Backup created:");
console.log(backupFile);

let source = fs.readFileSync(serverFile, "utf8");

// Normalize line endings for reliable processing.
source = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/*
==============================================================
1. FIND GLOBAL ERROR HANDLER BY ITS SECTION HEADER
==============================================================
*/
const globalStartMarker =
  "// ----------------------------------------------------\n" +
  "// GLOBAL ERROR HANDLER\n" +
  "// ----------------------------------------------------";

const globalNextMarker =
  "// ----------------------------------------------------\n" +
  "// API 404 HANDLER\n" +
  "// ----------------------------------------------------";

const globalStart = source.indexOf(globalStartMarker);
const globalEnd =
  globalStart >= 0
    ? source.indexOf(
        globalNextMarker,
        globalStart + globalStartMarker.length
      )
    : -1;

if (globalStart === -1 || globalEnd === -1) {
  console.error("");
  console.error("GLOBAL ERROR HANDLER section not found correctly.");
  console.error("No changes made.");
  process.exit(1);
}

const globalBlock =
  source.slice(globalStart, globalEnd).trim();

console.log("");
console.log("GLOBAL ERROR HANDLER: FOUND");

/*
==============================================================
2. FIND API 404 HANDLER BY ITS SECTION HEADER
==============================================================
*/
const notFoundStartMarker =
  "// ----------------------------------------------------\n" +
  "// API 404 HANDLER\n" +
  "// ----------------------------------------------------";

const notFoundStart =
  source.indexOf(notFoundStartMarker);

const exportMarker =
  "// ----------------------------------------------------\n" +
  "// EXPORT EXPRESS APP\n" +
  "// ----------------------------------------------------";

let notFoundEnd = -1;

if (notFoundStart >= 0) {
  notFoundEnd =
    source.indexOf(
      exportMarker,
      notFoundStart + notFoundStartMarker.length
    );
}

if (notFoundStart === -1 || notFoundEnd === -1) {
  console.error("");
  console.error("API 404 HANDLER section not found correctly.");
  console.error("No changes made.");
  process.exit(1);
}

const notFoundBlock =
  source.slice(notFoundStart, notFoundEnd).trim();

console.log("API 404 HANDLER: FOUND");

/*
==============================================================
3. SHOW EXACTLY WHAT WILL BE MOVED
==============================================================
*/
console.log("");
console.log("------------------------------------------------------------");
console.log("GLOBAL ERROR HANDLER BLOCK");
console.log("------------------------------------------------------------");
console.log(globalBlock);

console.log("");
console.log("------------------------------------------------------------");
console.log("API 404 HANDLER BLOCK");
console.log("------------------------------------------------------------");
console.log(notFoundBlock);

/*
==============================================================
4. REMOVE BOTH HANDLERS FROM THEIR CURRENT POSITIONS

Do this using exact section boundaries.
==============================================================
*/

source =
  source.slice(0, globalStart) +
  source.slice(globalEnd);

const newNotFoundStart =
  source.indexOf(notFoundStartMarker);

const newNotFoundEnd =
  newNotFoundStart >= 0
    ? source.indexOf(
        exportMarker,
        newNotFoundStart + notFoundStartMarker.length
      )
    : -1;

if (
  newNotFoundStart === -1 ||
  newNotFoundEnd === -1
) {
  console.error("");
  console.error(
    "Unable to locate API 404 handler after removing global handler."
  );

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

source =
  source.slice(0, newNotFoundStart) +
  source.slice(newNotFoundEnd);

console.log("");
console.log("Existing handler blocks removed from old positions.");

/*
==============================================================
5. FIND FINAL app.listen()
==============================================================
*/

const listenIndex =
  source.lastIndexOf("app.listen(");

if (listenIndex === -1) {
  console.error("");
  console.error("app.listen() not found.");

  fs.copyFileSync(backupFile, serverFile);
  process.exit(1);
}

console.log("");
console.log(
  "app.listen() found at character:",
  listenIndex
);

/*
==============================================================
6. REBUILD CORRECT EXPRESS ORDER

ALL NORMAL ROUTES
        ↓
API 404 HANDLER
        ↓
GLOBAL ERROR HANDLER
        ↓
app.listen()
==============================================================
*/

const correctHandlers = `

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
  correctHandlers +
  source.slice(listenIndex);

/*
==============================================================
7. WRITE FILE
==============================================================
*/

fs.writeFileSync(serverFile, source, "utf8");

console.log("");
console.log("Correct handlers inserted immediately before app.listen().");

/*
==============================================================
8. SYNTAX CHECK
==============================================================
*/

console.log("");
console.log("------------------------------------------------------------");
console.log("JAVASCRIPT SYNTAX CHECK");
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
  console.error("");
  console.error("Restoring backup...");

  fs.copyFileSync(backupFile, serverFile);

  console.error("Original file restored.");
  process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("HANDLER ORDER FIX V3 COMPLETE");
console.log("============================================================");
console.log("");
console.log("Correct order:");
console.log("1. All normal API routes");
console.log("2. API 404 handler");
console.log("3. Global error handler");
console.log("4. app.listen()");
console.log("");
console.log("Backup:");
console.log(backupFile);
console.log("");