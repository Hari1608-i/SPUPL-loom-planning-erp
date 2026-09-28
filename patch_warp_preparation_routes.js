const fs = require("fs");
const path = require("path");

const root = process.cwd();
const serverFile = path.join(root, "backend", "upload_server.js");

console.log("");
console.log("============================================================");
console.log("SPUPL WARP PREPARATION ROUTE PATCH");
console.log("============================================================");

if (!fs.existsSync(serverFile)) {
  throw new Error("backend/upload_server.js not found.");
}

const backupFile =
  serverFile +
  ".backup-before-warp-route-patch-" +
  Date.now();

fs.copyFileSync(serverFile, backupFile);

console.log("");
console.log("Backup created:");
console.log(backupFile);

let source = fs.readFileSync(serverFile, "utf8");

const routesToCheck = [
  "GET /api/warp-preparation/evaluate/:id",
  "PUT /api/warp-preparation/status/:id",
  "PATCH /api/warp-preparation/status/:id",
  "GET /api/warp-preparation/history/:loomNo",
  "GET /api/warp-preparation/prerequisite/:loomNo"
];

const missing = {
  evaluate:
    !source.includes("'/api/warp-preparation/evaluate/:") &&
    !source.includes('"/api/warp-preparation/evaluate/:'),

  statusPut:
    !source.includes("'/api/warp-preparation/status/:") &&
    !source.includes('"/api/warp-preparation/status/:'),

  history:
    !source.includes("'/api/warp-preparation/history/:") &&
    !source.includes('"/api/warp-preparation/history/:'),

  prerequisite:
    !source.includes("'/api/warp-preparation/prerequisite/:") &&
    !source.includes('"/api/warp-preparation/prerequisite/:')
};

console.log("");
console.log("Current route status:");

console.log(
  "evaluate:",
  missing.evaluate ? "MISSING" : "ALREADY EXISTS"
);

console.log(
  "status:",
  missing.statusPut ? "MISSING" : "ALREADY EXISTS"
);

console.log(
  "history:",
  missing.history ? "MISSING" : "ALREADY EXISTS"
);

console.log(
  "prerequisite:",
  missing.prerequisite ? "MISSING" : "ALREADY EXISTS"
);

const additions = [];

if (missing.evaluate) {
  additions.push(`
// ============================================================
// WARP PREPARATION - EVALUATION DETAILS
// ============================================================
app.get('/api/warp-preparation/evaluate/:id', async (req, res) => {
  try {
    const planId = Number(req.params.id);

    if (!Number.isFinite(planId) || planId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid plan ID is required.'
      });
    }

    const details =
      await warpPreparationService.getPreparationDetailsByPlanId(planId);

    if (!details) {
      return res.status(404).json({
        success: false,
        error: 'Planned loom record not found.'
      });
    }

    return res.json({
      success: true,
      details
    });
  } catch (error) {
    console.error('Warp preparation evaluation error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to evaluate warp preparation.'
    });
  }
});
`);
}

if (missing.statusPut) {
  additions.push(`
// ============================================================
// WARP PREPARATION - STATUS UPDATE
// Supports both PUT and PATCH because existing frontend pages
// use both methods.
// ============================================================

const updateWarpPreparationStatus = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid preparation record ID is required.'
      });
    }

    const {
      status,
      processStartDate,
      processStartTime,
      processCompletionDate,
      processCompletionTime,
      responsiblePerson,
      remarks,
      user
    } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required.'
      });
    }

    const result =
      await warpPreparationService.updateProcessStatus({
        id,
        status,
        processStartDate,
        processStartTime,
        processCompletionDate,
        processCompletionTime,
        responsiblePerson,
        remarks,
        user:
          user ||
          req.headers['x-user'] ||
          req.headers['x-role'] ||
          'Planner'
      });

    return res.json(result);
  } catch (error) {
    console.error('Warp preparation status update error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update warp preparation status.'
    });
  }
};

app.put(
  '/api/warp-preparation/status/:id',
  updateWarpPreparationStatus
);

app.patch(
  '/api/warp-preparation/status/:id',
  updateWarpPreparationStatus
);
`);
}

if (missing.history) {
  additions.push(`
// ============================================================
// WARP PREPARATION - HISTORY
// ============================================================
app.get('/api/warp-preparation/history/:loomNo', async (req, res) => {
  try {
    const loomNo = Number(req.params.loomNo);

    if (!Number.isFinite(loomNo) || loomNo <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid loom number is required.'
      });
    }

    const history =
      await warpPreparationService.getPreparationHistory(loomNo);

    return res.json({
      success: true,
      history: Array.isArray(history) ? history : []
    });
  } catch (error) {
    console.error('Warp preparation history error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load warp preparation history.'
    });
  }
});
`);
}

if (missing.prerequisite) {
  additions.push(`
// ============================================================
// WARP PREPARATION - WARP LOADING PREREQUISITE
// ============================================================
app.get('/api/warp-preparation/prerequisite/:loomNo', async (req, res) => {
  try {
    const loomNo = Number(req.params.loomNo);
    const planId =
      req.query.planId !== undefined &&
      req.query.planId !== ''
        ? Number(req.query.planId)
        : undefined;

    if (!Number.isFinite(loomNo) || loomNo <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid loom number is required.'
      });
    }

    if (
      planId !== undefined &&
      (!Number.isFinite(planId) || planId <= 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan ID.'
      });
    }

    const result =
      await warpPreparationService.checkWarpLoadingPrerequisite(
        loomNo,
        planId
      );

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Warp preparation prerequisite error:', error);

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        'Failed to check warp preparation prerequisite.'
    });
  }
});
`);
}

if (additions.length === 0) {
  console.log("");
  console.log("No missing Warp Preparation routes found.");
  console.log("No changes required.");
  process.exit(0);
}

const marker = "\nmodule.exports";

const insertPosition = source.lastIndexOf(marker);

if (insertPosition === -1) {
  console.error("module.exports marker not found.");
  console.error("Restoring backup...");

  fs.copyFileSync(backupFile, serverFile);

  process.exit(1);
}

const block =
  "\n\n" +
  additions.join("\n") +
  "\n";

source =
  source.slice(0, insertPosition) +
  block +
  source.slice(insertPosition);

fs.writeFileSync(serverFile, source, "utf8");

console.log("");
console.log("Routes added:");

for (const route of routesToCheck) {
  console.log(" + " + route);
}

console.log("");
console.log("Running JavaScript syntax check...");

try {
  const Module = require("module");
  const testModule = new Module(serverFile, module);

  testModule.filename = serverFile;
  testModule.paths = Module._nodeModulePaths(
    path.dirname(serverFile)
  );

  testModule._compile(
    fs.readFileSync(serverFile, "utf8"),
    serverFile
  );

  console.log("SYNTAX CHECK: PASS");
} catch (error) {
  console.error("");
  console.error("SYNTAX CHECK: FAILED");
  console.error(error.message);
  console.error("");
  console.error("Restoring backup...");

  fs.copyFileSync(backupFile, serverFile);

  console.log("Original file restored.");

  process.exit(1);
}

console.log("");
console.log("============================================================");
console.log("WARP PREPARATION PATCH COMPLETE");
console.log("============================================================");