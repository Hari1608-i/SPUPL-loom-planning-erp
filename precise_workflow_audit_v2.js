const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, "frontend", "src");
const SERVER = path.join(ROOT, "backend", "upload_server.js");
const WARP_SERVICE = path.join(
  ROOT,
  "backend",
  "services",
  "warpPreparationService.js"
);
const ANALYTICS = path.join(
  ROOT,
  "backend",
  "routes",
  "analytics.js"
);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      item.name === "node_modules" ||
      item.name === "dist" ||
      item.name === ".git"
    ) {
      continue;
    }

    const full = path.join(dir, item.name);

    if (item.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }

  return out;
}

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function rel(file) {
  return path.relative(ROOT, file);
}

function normalizeFrontendUrl(url) {
  let r = String(url || "");

  // Remove template expressions such as ${API_URL}
  r = r.replace(/\$\{[^}]+\}/g, "");

  // Find the actual /api portion.
  const apiIndex = r.indexOf("/api");

  if (apiIndex >= 0) {
    r = r.substring(apiIndex);
  }

  // Remove query string
  const q = r.indexOf("?");

  if (q >= 0) {
    r = r.substring(0, q);
  }

  // Convert remaining template expressions to params
  r = r.replace(/\$\{[^}]+\}/g, ":param");

  // Clean slashes
  r = r.replace(/\/+/g, "/");

  // Ensure leading slash
  if (!r.startsWith("/")) {
    r = "/" + r;
  }

  // Remove trailing slash except /api
  if (r.length > 4) {
    r = r.replace(/\/+$/, "");
  }

  return r;
}

function normalizeBackendRoute(route) {
  let r = String(route || "");

  r = r.replace(/\/+/g, "/");

  if (!r.startsWith("/")) {
    r = "/" + r;
  }

  if (r.length > 4) {
    r = r.replace(/\/+$/, "");
  }

  return r;
}

function splitRoute(route) {
  return normalizeBackendRoute(route)
    .split("/")
    .filter(Boolean);
}

function sameRoutePattern(a, b) {
  const pa = splitRoute(a);
  const pb = splitRoute(b);

  if (pa.length !== pb.length) {
    return false;
  }

  for (let i = 0; i < pa.length; i++) {
    const x = pa[i];
    const y = pb[i];

    const xParam =
      x === ":param" ||
      x.startsWith(":");

    const yParam =
      y === ":param" ||
      y.startsWith(":");

    if (xParam || yParam) {
      continue;
    }

    if (x !== y) {
      return false;
    }
  }

  return true;
}

function extractFrontendCalls() {
  const files = walk(FRONTEND).filter(f =>
    /\.(js|jsx|ts|tsx)$/.test(f)
  );

  const calls = [];

  const patterns = [
    /fetch\s*\(\s*`([^`]+)`\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g,
    /fetch\s*\(\s*["']([^"']+)["']\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g
  ];

  for (const file of files) {
    const content = read(file);

    for (const regex of patterns) {
      regex.lastIndex = 0;

      let m;

      while ((m = regex.exec(content))) {
        const rawUrl = m[1];

        if (!rawUrl.includes("/api")) {
          continue;
        }

        const options = m[2] || "";

        const methodMatch = options.match(
          /method\s*:\s*["']([^"']+)["']/i
        );

        const method = methodMatch
          ? methodMatch[1].toUpperCase()
          : "GET";

        const route =
          normalizeFrontendUrl(rawUrl);

        if (!route.startsWith("/api")) {
          continue;
        }

        const line =
          content
            .slice(0, m.index)
            .split(/\r?\n/)
            .length;

        calls.push({
          method,
          route,
          file: rel(file),
          line
        });
      }
    }
  }

  return calls;
}

function extractBackendRoutes(file) {
  const content = read(file);

  const routes = [];

  const regex =
    /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;

  let m;

  while ((m = regex.exec(content))) {
    routes.push({
      method: m[1].toUpperCase(),
      route: normalizeBackendRoute(m[3]),
      file: rel(file),
      line:
        content
          .slice(0, m.index)
          .split(/\r?\n/)
          .length
    });
  }

  return routes;
}

function extractFunctionNames() {
  if (!fs.existsSync(WARP_SERVICE)) {
    return [];
  }

  const content = read(WARP_SERVICE);
  const found = new Map();

  const regexes = [
    /async\s+function\s+([A-Za-z0-9_$]+)/g,
    /function\s+([A-Za-z0-9_$]+)/g,
    /([A-Za-z0-9_$]+)\s*:\s*async\s+function/g,
    /([A-Za-z0-9_$]+)\s*:\s*async\s*\(/g
  ];

  for (const regex of regexes) {
    let m;

    while ((m = regex.exec(content))) {
      found.set(m[1], m[1]);
    }
  }

  return [...found.keys()].sort();
}

function extractFunctionBodies() {
  if (!fs.existsSync(WARP_SERVICE)) {
    return;
  }

  const content = read(WARP_SERVICE);

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

  console.log("");
  console.log("------------------------------------------------------------");
  console.log("WARP PREPARATION SERVICE SIGNATURES");
  console.log("------------------------------------------------------------");

  for (const name of names) {
    const patterns = [
      new RegExp(
        `async\\\\s+function\\\\s+${name}\\\\s*\\\\([^)]*\\\\)`
      ),
      new RegExp(
        `${name}\\\\s*:\\\\s*async\\\\s*\\\\([^)]*\\\\)`
      ),
      new RegExp(
        `${name}\\\\s*=\\\\s*async\\\\s*\\\\([^)]*\\\\)`
      )
    ];

    let found = false;

    for (const regex of patterns) {
      const match = content.match(regex);

      if (match) {
        console.log(`${name}: ${match[0]}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`${name}: signature not directly detected`);
    }
  }
}

const frontend = extractFrontendCalls();
const backend = extractBackendRoutes(SERVER);

const uniqueFrontend = [
  ...new Map(
    frontend.map(x => [
      `${x.method}|${x.route}`,
      x
    ])
  ).values()
];

const uniqueBackend = [
  ...new Map(
    backend.map(x => [
      `${x.method}|${x.route}`,
      x
    ])
  ).values()
];

console.log("");
console.log("============================================================");
console.log("SPUPL PRECISE API AUDIT V2");
console.log("============================================================");
console.log("");

console.log(
  "Frontend unique API calls:",
  uniqueFrontend.length
);

console.log(
  "Backend unique API routes:",
  uniqueBackend.length
);

console.log("");

console.log("------------------------------------------------------------");
console.log("GENUINELY MISSING METHOD + ROUTE");
console.log("------------------------------------------------------------");

const missing = [];

for (const f of uniqueFrontend) {
  const match = uniqueBackend.find(
    b =>
      b.method === f.method &&
      sameRoutePattern(f.route, b.route)
  );

  if (!match) {
    missing.push(f);

    console.log(
      `${f.method.padEnd(6)} ${f.route} <- ${f.file}:${f.line}`
    );
  }
}

console.log("");
console.log(
  "GENUINE MISSING COUNT:",
  missing.length
);

console.log("");

console.log("------------------------------------------------------------");
console.log("BACKEND ROUTES - KEY WORKFLOWS");
console.log("------------------------------------------------------------");

const prefixes = [
  "/api/warp-preparation",
  "/api/planning/next-plan",
  "/api/sizing",
  "/api/order-completion",
  "/api/erp-alerts",
  "/api/beam-stock",
  "/api/reed-stock",
  "/api/production-logs",
  "/api/orders",
  "/api/analytics",
  "/api/allocate",
  "/api/confirm-plan",
  "/api/warp-load"
];

for (const prefix of prefixes) {
  console.log("");
  console.log(`[${prefix}]`);

  const routes = uniqueBackend.filter(x =>
    x.route === prefix ||
    x.route.startsWith(prefix + "/")
  );

  if (!routes.length) {
    console.log("  NONE");
  } else {
    for (const route of routes) {
      console.log(
        `  ${route.method} ${route.route} -> ${route.file}:${route.line}`
      );
    }
  }
}

console.log("");

console.log("------------------------------------------------------------");
console.log("WARP PREPARATION SERVICE FUNCTIONS");
console.log("------------------------------------------------------------");

if (fs.existsSync(WARP_SERVICE)) {
  console.log(
    extractFunctionNames().join("\n")
  );
} else {
  console.log("SERVICE FILE NOT FOUND");
}

extractFunctionBodies();

console.log("");

console.log("------------------------------------------------------------");
console.log("ANALYTICS ROUTER");
console.log("------------------------------------------------------------");

if (fs.existsSync(ANALYTICS)) {
  const analyticsRoutes =
    extractBackendRoutes(ANALYTICS);

  for (const r of analyticsRoutes) {
    console.log(
      `${r.method} ${r.route} -> ${r.file}:${r.line}`
    );
  }
} else {
  console.log("ANALYTICS ROUTER FILE NOT FOUND");
}

console.log("");

console.log("------------------------------------------------------------");
console.log("DIRECT /api/analytics IN upload_server.js");
console.log("------------------------------------------------------------");

const directAnalytics = uniqueBackend.filter(
  x => x.route === "/api/analytics"
);

for (const r of directAnalytics) {
  console.log(
    `${r.method} ${r.route} -> ${r.file}:${r.line}`
  );
}

console.log("");

console.log("============================================================");
console.log("AUDIT V2 COMPLETE");
console.log("============================================================");