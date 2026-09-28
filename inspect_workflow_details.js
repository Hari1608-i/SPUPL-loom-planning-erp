const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function showLines(file, start, count) {
  const full = path.join(ROOT, file);

  if (!fs.existsSync(full)) {
    console.log(`FILE NOT FOUND: ${file}`);
    return;
  }

  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);

  const from = Math.max(0, start - 1);
  const to = Math.min(lines.length, from + count);

  for (let i = from; i < to; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

function showMatches(file, patterns, before = 3, after = 8) {
  const full = path.join(ROOT, file);

  if (!fs.existsSync(full)) {
    console.log(`FILE NOT FOUND: ${file}`);
    return;
  }

  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);

  console.log("");
  console.log(`============================================================`);
  console.log(file);
  console.log(`============================================================`);

  const shown = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!patterns.some(p => line.includes(p))) {
      continue;
    }

    const from = Math.max(0, i - before);
    const to = Math.min(lines.length, i + after + 1);

    const key = `${from}-${to}`;

    if (shown.has(key)) {
      continue;
    }

    shown.add(key);

    console.log("");
    console.log(`--- lines ${from + 1}-${to} ---`);

    for (let j = from; j < to; j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  }
}

console.log("");
console.log("============================================================");
console.log("SPUPL WORKFLOW DETAIL INSPECTION");
console.log("============================================================");

console.log("");
console.log("------------------------------------------------------------");
console.log("1. WARP PREPARATION SERVICE FUNCTIONS");
console.log("------------------------------------------------------------");

const servicePath = path.join(
  ROOT,
  "backend",
  "services",
  "warpPreparationService.js"
);

if (fs.existsSync(servicePath)) {
  const service = require(servicePath);

  const names = [
    "checkWarpLoadingPrerequisite",
    "confirmPreparationProcess",
    "evaluateKnottingEligibility",
    "getAllActivePreparationRecords",
    "getPreparationDetailsByLoomNo",
    "getPreparationDetailsByPlanId",
    "getPreparationDetailsForPlan",
    "getPreparationHistory",
    "updateProcessStatus"
  ];

  for (const name of names) {
    console.log("");
    console.log(`### ${name}`);

    const fn = service[name];

    if (typeof fn !== "function") {
      console.log("NOT EXPORTED AS FUNCTION");
      continue;
    }

    const source = fn.toString();

    console.log(source.slice(0, 3500));
  }
} else {
  console.log("warpPreparationService.js NOT FOUND");
}

console.log("");
console.log("------------------------------------------------------------");
console.log("2. PLANNED LOOMS WARP PREPARATION");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/PlannedLooms.tsx",
  [
    "/api/warp-preparation",
    "warp-preparation"
  ],
  5,
  18
);

console.log("");
console.log("------------------------------------------------------------");
console.log("3. WARP PREPARATION SECTION");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/components/warpPreparation/WarpPreparationSection.tsx",
  [
    "/api/warp-preparation",
    "warp-preparation"
  ],
  5,
  18
);

console.log("");
console.log("------------------------------------------------------------");
console.log("4. WARP PREP HISTORY MODAL");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/components/warpPreparation/WarpPrepHistoryModal.tsx",
  [
    "/api/warp-preparation",
    "warp-preparation"
  ],
  5,
  15
);

console.log("");
console.log("------------------------------------------------------------");
console.log("5. MAIN ENTRY WARP PREPARATION");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/MainEntry.tsx",
  [
    "/api/warp-preparation",
    "warp-preparation"
  ],
  5,
  18
);

console.log("");
console.log("------------------------------------------------------------");
console.log("6. SIZING DASHBOARD");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/SizingDashboard.tsx",
  [
    "/api/sizing"
  ],
  5,
  18
);

console.log("");
console.log("------------------------------------------------------------");
console.log("7. ERP ALERT CENTER");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/ErpAlertCenter.tsx",
  [
    "/api/erp-alerts"
  ],
  5,
  18
);

console.log("");
console.log("------------------------------------------------------------");
console.log("8. ELIGIBILITY ENGINE");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/EligibilityEngine.tsx",
  [
    "/api/allocate"
  ],
  8,
  25
);

console.log("");
console.log("------------------------------------------------------------");
console.log("9. MAIN ENTRY PRODUCTION / NEXT PLAN");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/MainEntry.tsx",
  [
    "/api/production-logs",
    "/api/next-plans",
    "/api/active-runs"
  ],
  6,
  20
);

console.log("");
console.log("------------------------------------------------------------");
console.log("10. PLANNED LOOMS NEXT PLAN DELETE");
console.log("------------------------------------------------------------");

showMatches(
  "frontend/src/pages/PlannedLooms.tsx",
  [
    "/api/planning/next-plan"
  ],
  6,
  20
);

console.log("");
console.log("------------------------------------------------------------");
console.log("11. CURRENT BACKEND RELATED ROUTES");
console.log("------------------------------------------------------------");

showMatches(
  "backend/upload_server.js",
  [
    "warp-preparation",
    "sizing/requests",
    "erp-alerts",
    "production-logs",
    "next-plans",
    "active-runs",
    "/api/allocate"
  ],
  4,
  18
);

console.log("");
console.log("============================================================");
console.log("INSPECTION COMPLETE");
console.log("============================================================");