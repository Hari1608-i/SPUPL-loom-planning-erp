const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, "frontend", "src");
const BACKEND = path.join(ROOT, "backend");
const SERVER = path.join(BACKEND, "upload_server.js");
const WARP_SERVICE = path.join(
  BACKEND,
  "services",
  "warpPreparationService.js"
);
const ANALYTICS = path.join(
  BACKEND,
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
    ) continue;

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

function normalizeRoute(route) {
  let r = String(route || "");

  r = r
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\[[^\]]+\]/g, ":param")
    .replace(/\/+$/, "");

  const q = r.indexOf("?");

  if (q >= 0) {
    r = r.substring(0, q);
  }

  return r;
}

function splitRoute(route) {
  return normalizeRoute(route)
    .split("/")
    .filter(Boolean);
}

function sameRoutePattern(a, b) {
  const pa = splitRoute(a);
  const pb = splitRoute(b);

  if (pa.length !== pb.length) return false;

  for (let i = 0; i < pa.length; i++) {
    const x = pa[i];
    const y = pb[i];

    if (
      x === ":param" ||
      x.startsWith(":") ||
      y === ":param" ||
      y.startsWith(":")
    ) {
      continue;
    }

    if (x !== y) return false;
  }

  return true;
}

function extractFrontendCalls() {
  const files = walk(FRONTEND).filter(f =>
    /\.(js|jsx|ts|tsx)$/.test(f)
  );

  const calls = [];

  const fetchRegex =
    /fetch\s*\(\s*`([^`]+)`\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;

  const fetchStringRegex =
    /fetch\s*\(\s*["']([^"']+)["']\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;

  for (const file of files) {
    const text = read(file);

    let m;

    while ((m = fetchRegex.exec(text))) {
      const url = m[1];

      if (!url.includes("/api/")) continue;

      const options = m[2] || "";

      const methodMatch =
        options.match(/method\s*:\s*["']([^"']+)["']/i);

      const method = methodMatch
        ? methodMatch[1].toUpperCase()
        : "GET";

      const line =
        text.slice(0, m.index).split(/\r?\n/).length;

      calls.push({
        method,
        route: normalizeRoute(
          url
            .replace(/\$\{[^}]+\}/g, ":param")
            .replace(/\?.*$/, "")
        ),
        file: rel(file),
        line
      });
    }

    while ((m = fetchStringRegex.exec(text))) {
      const url = m[1];

      if (!url.includes("/api/")) continue;

      const options = m[2] || "";

      const methodMatch =
        options.match(/method\s*:\s*["']([^"']+)["']/i);

      const method = methodMatch
        ? methodMatch[1].toUpperCase()
        : "GET";

      const line =
        text.slice(0, m.index).split(/\r?\n/).length;

      calls.push({
        method,
        route: normalizeRoute(
          url
            .replace(/\$\{[^}]+\}/g, ":param")
            .replace(/\?.*$/, "")
        ),
        file: rel(file),
        line
      });
    }
  }

  return calls;
}

function extractBackendRoutes(file) {
  const text = read(file);

  const routes = [];

  const re =
    /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;

  let m;

  while ((m = re.exec(text))) {
    routes.push({
      method: m[1].toUpperCase(),
      route: normalizeRoute(m[3]),
      file: rel(file),
      line:
        text.slice(0, m.index).split(/\r?\n/).length
    });
  }

  return routes;
}

function serviceFunctions() {
  if (!fs.existsSync(WARP_SERVICE)) return [];

  const text = read(WARP_SERVICE);
  const names = new Set();

  const patterns = [
    /async\s+function\s+([A-Za-z0-9_$]+)/g,
    /function\s+([A-Za-z0-9_$]+)/g,
    /([A-Za-z0-9_$]+)\s*:\s*async\s+function/g,
    /([A-Za-z0-9_$]+)\s*:\s*async\s*\(/g
  ];

  for (const re of patterns) {
    let m;

    while ((m = re.exec(text))) {
      names.add(m[1]);
    }
  }

  return [...names].sort();
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
console.log("SPUPL PRECISE FRONTEND -> BACKEND WORKFLOW AUDIT");
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
console.log("1. GENUINE MISSING API METHOD + ROUTE");
console.log("------------------------------------------------------------");

const missing = [];

for (const f of uniqueFrontend) {
  const found = uniqueBackend.some(
    b =>
      b.method === f.method &&
      sameRoutePattern(b.route, f.route)
  );

  if (!found) {
    missing.push(f);

    console.log(
      `${f.method.padEnd(6)} ${f.route}  <- ${f.file}:${f.line}`
    );
  }
}

console.log("");
console.log(
  "Genuine missing frontend calls:",
  missing.length
);

console.log("");

console.log("------------------------------------------------------------");
console.log("2. EXISTING BACKEND ROUTE MATCHES");
console.log("------------------------------------------------------------");

for (const f of uniqueFrontend) {
  const matches = uniqueBackend.filter(
    b =>
      b.method === f.method &&
      sameRoutePattern(b.route, f.route)
  );

  if (matches.length) {
    const b = matches[0];

    if (
      f.route.includes("warp-preparation") ||
      f.route.includes("analytics") ||
      f.route.includes("planning") ||
      f.route.includes("sizing") ||
      f.route.includes("order-completion")
    ) {
      console.log(
        `${f.method} ${f.route}`
      );

      console.log(
        `  -> ${b.method} ${b.route}`
      );
    }
  }
}

console.log("");

console.log("------------------------------------------------------------");
console.log("3. WARP PREPARATION SERVICE FUNCTIONS");
console.log("------------------------------------------------------------");

if (fs.existsSync(WARP_SERVICE)) {
  const functions = serviceFunctions();

  functions.forEach(x =>
    console.log(x)
  );

  console.log("");
  console.log(
    "Warp preparation service:",
    rel(WARP_SERVICE)
  );
} else {
  console.log(
    "warpPreparationService.js NOT FOUND"
  );
}

console.log("");

console.log("------------------------------------------------------------");
console.log("4. ANALYTICS ROUTER");
console.log("------------------------------------------------------------");

if (fs.existsSync(ANALYTICS)) {
  console.log(
    "Analytics file:",
    rel(ANALYTICS)
  );

  const analyticsRoutes =
    extractBackendRoutes(ANALYTICS);

  analyticsRoutes.forEach(x =>
    console.log(
      `${x.method} ${x.route}  line ${x.line}`
    )
  );
} else {
  console.log(
    "backend/routes/analytics.js NOT FOUND"
  );
}

console.log("");

console.log("------------------------------------------------------------");
console.log("5. DUPLICATE ANALYTICS DEFINITIONS");
console.log("------------------------------------------------------------");

const analyticsBackend =
  uniqueBackend.filter(x =>
    normalizeRoute(x.route) === "/api/analytics"
  );

analyticsBackend.forEach(x =>
  console.log(
    `${x.method} ${x.route} -> ${x.file}:${x.line}`
  )
);

console.log("");

console.log("------------------------------------------------------------");
console.log("6. IMPORTANT WORKFLOW ROUTES");
console.log("------------------------------------------------------------");

const importantPrefixes = [
  "/api/warp-preparation",
  "/api/planning/next-plan",
  "/api/sizing",
  "/api/order-completion",
  "/api/analytics",
  "/api/allocate",
  "/api/confirm-plan",
  "/api/warp-load"
];

for (const prefix of importantPrefixes) {
  console.log("");
  console.log("[" + prefix + "]");

  const f = uniqueFrontend.filter(x =>
    x.route.startsWith(prefix)
  );

  const b = uniqueBackend.filter(x =>
    x.route.startsWith(prefix)
  );

  console.log("FRONTEND:");

  f.forEach(x =>
    console.log(
      `  ${x.method} ${x.route} <- ${x.file}:${x.line}`
    )
  );

  console.log("BACKEND:");

  b.forEach(x =>
    console.log(
      `  ${x.method} ${x.route} -> ${x.file}:${x.line}`
    )
  );
}

console.log("");

console.log("============================================================");
console.log("PRECISE AUDIT COMPLETE");
console.log("============================================================");