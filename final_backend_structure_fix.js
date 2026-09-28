const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const SERVER = path.join(ROOT, "backend", "upload_server.js");

console.log("");
console.log("============================================================");
console.log("SPUPL FINAL BACKEND STRUCTURE FIX");
console.log("============================================================");

if (!fs.existsSync(SERVER)) {
  console.error("ERROR: backend/upload_server.js not found.");
  process.exit(1);
}

let source = fs.readFileSync(SERVER, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

/*
==============================================================
1. BACKUP
==============================================================
*/

const BACKUP =
  SERVER +
  ".backup-before-final-structure-fix-" +
  Date.now();

fs.copyFileSync(SERVER, BACKUP);

console.log("");
console.log("Backup created:");
console.log(BACKUP);

/*
==============================================================
2. CHECK WARP PREPARATION SERVICE
==============================================================
*/

if (!source.includes("warpPreparationService")) {
  console.error("");
  console.error(
    "ERROR: warpPreparationService reference not found in upload_server.js."
  );
  console.error("No changes made.");

  fs.copyFileSync(BACKUP, SERVER);
  process.exit(1);
}

console.log("");
console.log("warpPreparationService reference: FOUND");

/*
==============================================================
3. RESTORE /api/warp-preparation/all IF MISSING
==============================================================
*/

const allRouteExists =
  source.includes(
    "app.get('/api/warp-preparation/all'"
  ) ||
  source.includes(
    'app.get("/api/warp-preparation/all"'
  );

if (allRouteExists) {
  console.log("");
  console.log("/api/warp-preparation/all: ALREADY EXISTS");
} else {
  const routeMarker =
    "// ============================================================\n" +
    "// WARP PREPARATION - EVALUATION DETAILS\n" +
    "// ============================================================";

  const markerIndex = source.indexOf(routeMarker);

  if (markerIndex === -1) {
    console.error("");
    console.error(
      "ERROR: Warp Preparation evaluation section not found."
    );
    console.error("No changes made.");

    fs.copyFileSync(BACKUP, SERVER);
    process.exit(1);
  }

  const allRoute = `
// ============================================================
// WARP PREPARATION - ALL ACTIVE RECORDS
// ============================================================

app.get('/api/warp-preparation/all', async (req, res) => {
  try {
    const data =
      await warpPreparationService.getAllActivePreparationRecords();

    return res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error(
      'Warp prep all records error:',
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        'Failed to load warp preparation records.'
    });
  }
});

`;

  source =
    source.slice(0, markerIndex) +
    allRoute +
    source.slice(markerIndex);

  console.log("");
  console.log("/api/warp-preparation/all: RESTORED");
}

/*
==============================================================
4. REBUILD EVERYTHING AFTER module.exports = app
==============================================================

The current file has duplicate handler comments and an
incorrect tail structure.

We preserve EVERYTHING BEFORE module.exports = app,
including all existing API routes.

Only the tail is replaced.
==============================================================
*/

const exportMarker = "module.exports = app;";

const exportIndex = source.indexOf(exportMarker);

if (exportIndex === -1) {
  console.error("");
  console.error(
    "ERROR: module.exports = app; not found."
  );
  console.error("No changes made.");

  fs.copyFileSync(BACKUP, SERVER);
  process.exit(1);
}

console.log("");
console.log(
  "module.exports = app found at character:",
  exportIndex
);

/*
Preserve all code before module.exports.
This includes:
- Existing routes
- Recovered routes
- Warp Preparation routes
- Analytics
- Orders
- Planning
- Production
- User Management
- Existing business logic
*/

const mainCode =
  source.slice(0, exportIndex);

/*
==============================================================
5. CORRECT FINAL EXPRESS TAIL
==============================================================
*/

const finalTail = `

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
    error:
      err.message ||
      'Internal Server Error'
  });
});

// ----------------------------------------------------
// EXPORT EXPRESS APP
// ----------------------------------------------------

module.exports = app;

// ----------------------------------------------------
// LOCAL SERVER ONLY
// ----------------------------------------------------

if (!process.env.VERCEL) {
  const PORT =
    process.env.PORT || 3002;

  app.listen(
    PORT,
    () => {
      console.log(
        \`Backend server running locally on port \${PORT}\`
      );
    }
  );
}
`;

const finalSource =
  mainCode.trimEnd() +
  "\n" +
  finalTail;

fs.writeFileSync(
  SERVER,
  finalSource,
  "utf8"
);

console.log("");
console.log("Final Express tail rebuilt successfully.");

/*
==============================================================
6. SYNTAX CHECK
==============================================================
*/

console.log("");
console.log("------------------------------------------------------------");
console.log("JAVASCRIPT SYNTAX CHECK");
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
  console.error("");
  console.error("Restoring backup...");

  fs.copyFileSync(BACKUP, SERVER);

  console.error("Original file restored.");
  process.exit(1);
}

/*
==============================================================
7. FINAL STATIC VERIFICATION
==============================================================
*/

const finalCheck =
  fs.readFileSync(SERVER, "utf8");

const checks = [
  [
    "/api/warp-preparation/all",
    finalCheck.includes(
      "app.get('/api/warp-preparation/all'"
    )
  ],
  [
    "/api/warp-preparation/evaluate/:id",
    finalCheck.includes(
      "app.get('/api/warp-preparation/evaluate/:id'"
    )
  ],
  [
    "/api/warp-preparation/status/:id",
    finalCheck.includes(
      "/api/warp-preparation/status/:id"
    )
  ],
  [
    "/api/warp-preparation/history/:loomNo",
    finalCheck.includes(
      "app.get('/api/warp-preparation/history/:loomNo'"
    )
  ],
  [
    "/api/warp-preparation/prerequisite/:loomNo",
    finalCheck.includes(
      "app.get('/api/warp-preparation/prerequisite/:loomNo'"
    )
  ],
  [
    "API 404 HANDLER",
    finalCheck.includes(
      "API 404 HANDLER"
    )
  ],
  [
    "GLOBAL ERROR HANDLER",
    finalCheck.includes(
      "GLOBAL ERROR HANDLER"
    )
  ],
  [
    "module.exports = app",
    finalCheck.includes(
      "module.exports = app;"
    )
  ],
  [
    "app.listen",
    finalCheck.includes(
      "app.listen("
    )
  ]
];

console.log("");
console.log("------------------------------------------------------------");
console.log("FINAL STATIC VERIFICATION");
console.log("------------------------------------------------------------");

let failed = false;

for (const [name, ok] of checks) {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}`
  );

  if (!ok) {
    failed = true;
  }
}

/*
==============================================================
8. VERIFY HANDLER ORDER BY CHARACTER POSITION
==============================================================
*/

const pos404 =
  finalCheck.indexOf(
    "// API 404 HANDLER"
  );

const posGlobal =
  finalCheck.indexOf(
    "// GLOBAL ERROR HANDLER"
  );

const posExport =
  finalCheck.indexOf(
    "module.exports = app;"
  );

const posListen =
  finalCheck.indexOf(
    "app.listen("
  );

console.log("");
console.log("Handler order:");

console.log(
  "404 handler:",
  pos404
);

console.log(
  "Global error handler:",
  posGlobal
);

console.log(
  "module.exports:",
  posExport
);

console.log(
  "app.listen:",
  posListen
);

if (
  pos404 === -1 ||
  posGlobal === -1 ||
  posExport === -1 ||
  posListen === -1 ||
  !(
    pos404 <
    posGlobal &&
    posGlobal <
    posExport &&
    posExport <
    posListen
  )
) {
  console.error("");
  console.error(
    "ERROR: Final Express handler order is invalid."
  );
  console.error("Restoring backup...");

  fs.copyFileSync(BACKUP, SERVER);

  process.exit(1);
}

if (failed) {
  console.error("");
  console.error(
    "One or more required routes are missing."
  );
  console.error("Restoring backup...");

  fs.copyFileSync(BACKUP, SERVER);

  process.exit(1);
}

console.log("");
console.log("FINAL ROUTE STRUCTURE: PASS");

console.log("");
console.log("============================================================");
console.log("FINAL BACKEND STRUCTURE FIX COMPLETE");
console.log("============================================================");
console.log("");
console.log("Preserved all existing code before module.exports.");
console.log("Restored /api/warp-preparation/all.");
console.log("Removed duplicate broken tail structure.");
console.log("Placed 404 handler after all API routes.");
console.log("Placed global error handler after 404.");
console.log("Placed module.exports before local server startup.");
console.log("Syntax check passed.");
console.log("");
console.log("Backup:");
console.log(BACKUP);
console.log("");