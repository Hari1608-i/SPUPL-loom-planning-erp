const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, "frontend", "src");
const BACKEND = path.join(ROOT, "backend");
const REPORT = path.join(ROOT, "SPUPL_FULL_API_AUDIT.txt");

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

function rel(file) {
  return path.relative(ROOT, file);
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

const lines = [];

function log(text = "") {
  console.log(text);
  lines.push(text);
}

log("============================================================");
log("SPUPL LOOM ERP - FULL FRONTEND / BACKEND / API AUDIT");
log("============================================================");
log(`Root: ${ROOT}`);
log(`Time: ${new Date().toISOString()}`);
log("");

/* -----------------------------------------------------------
   PROJECT FILES
----------------------------------------------------------- */

const frontendFiles = walk(FRONTEND).filter(f =>
  /\.(ts|tsx|js|jsx)$/.test(f)
);

const backendFiles = walk(BACKEND).filter(f =>
  /\.(js|ts|prisma)$/.test(f)
);

log("------------------------------------------------------------");
log("1. FRONTEND FILES");
log("------------------------------------------------------------");

frontendFiles
  .map(rel)
  .sort()
  .forEach(f => log(f));

log("");
log(`Frontend source files: ${frontendFiles.length}`);
log("");

/* -----------------------------------------------------------
   FRONTEND API REFERENCES
----------------------------------------------------------- */

log("------------------------------------------------------------");
log("2. FRONTEND API REFERENCES");
log("------------------------------------------------------------");

const frontendApiRefs = [];

for (const file of frontendFiles) {
  const text = readSafe(file);
  const fileLines = text.split(/\r?\n/);

  fileLines.forEach((line, index) => {
    const matches = line.match(
      /\/api\/[A-Za-z0-9_./:${}\-?=&[\]%]+/g
    );

    if (matches) {
      for (const api of matches) {
        frontendApiRefs.push({
          file: rel(file),
          line: index + 1,
          api: api.trim(),
          source: line.trim()
        });
      }
    }
  });
}

const uniqueFrontendApis = [
  ...new Map(
    frontendApiRefs.map(x => [
      `${x.api}|${x.source}`,
      x
    ])
  ).values()
];

for (const x of uniqueFrontendApis) {
  log(`${x.api}  | ${x.file}:${x.line}`);
}

log("");
log(`Frontend API references found: ${uniqueFrontendApis.length}`);
log("");

/* -----------------------------------------------------------
   BACKEND ROUTES
----------------------------------------------------------- */

log("------------------------------------------------------------");
log("3. BACKEND ROUTES");
log("------------------------------------------------------------");

const routeRegex =
  /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;

const backendRoutes = [];

for (const file of backendFiles) {
  if (!file.endsWith(".js") && !file.endsWith(".ts")) continue;

  const text = readSafe(file);

  let match;

  while ((match = routeRegex.exec(text))) {
    backendRoutes.push({
      method: match[1].toUpperCase(),
      route: match[3],
      file: rel(file)
    });
  }
}

for (const r of backendRoutes) {
  log(`${r.method.padEnd(6)} ${r.route}  | ${r.file}`);
}

log("");
log(`Backend explicit routes found: ${backendRoutes.length}`);
log("");

/* -----------------------------------------------------------
   MISSING FRONTEND ROUTES
----------------------------------------------------------- */

function normalizeApi(api) {
  let value = api;

  value = value
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\[[^\]]+\]/g, ":param")
    .replace(/\/+$/, "");

  const q = value.indexOf("?");

  if (q >= 0) {
    value = value.substring(0, q);
  }

  return value;
}

const normalizedBackendRoutes = backendRoutes.map(r => ({
  ...r,
  route: normalizeApi(r.route)
}));

const frontendApiPaths = [
  ...new Set(
    frontendApiRefs
      .map(x => normalizeApi(x.api))
      .filter(x => x.startsWith("/api/"))
  )
];

log("------------------------------------------------------------");
log("4. POSSIBLE FRONTEND -> BACKEND ROUTE MISMATCHES");
log("------------------------------------------------------------");

const missingCandidates = [];

for (const frontendPath of frontendApiPaths) {
  const exists = normalizedBackendRoutes.some(r => {
    if (r.route === frontendPath) return true;

    const routeParts = r.route.split("/");
    const pathParts = frontendPath.split("/");

    if (routeParts.length !== pathParts.length) return false;

    return routeParts.every((part, i) => {
      if (part.startsWith(":")) return true;
      return part === pathParts[i];
    });
  });

  if (!exists) {
    missingCandidates.push(frontendPath);
    log(`POSSIBLE MISSING ROUTE: ${frontendPath}`);
  }
}

if (!missingCandidates.length) {
  log("No obvious missing literal routes found.");
}

log("");
log(`Possible missing routes: ${missingCandidates.length}`);
log("");

/* -----------------------------------------------------------
   WARP PREPARATION SERVICE
----------------------------------------------------------- */

log("------------------------------------------------------------");
log("5. WARP PREPARATION SERVICE");
log("------------------------------------------------------------");

const warpServiceCandidates = [
  path.join(BACKEND, "services", "warpPreparationService.js"),
  path.join(BACKEND, "services", "warpPreparationService.ts")
];

let warpFile = null;

for (const f of warpServiceCandidates) {
  if (fs.existsSync(f)) {
    warpFile = f;
    break;
  }
}

if (!warpFile) {
  log("warpPreparationService file NOT FOUND");
} else {
  log(`Service file: ${rel(warpFile)}`);

  const serviceText = readSafe(warpFile);

  try {
    const service = require(warpFile);

    if (service && typeof service === "object") {
      log(
        "Exports: " +
        Object.keys(service).sort().join(", ")
      );
    } else {
      log(
        "Service export type: " +
        typeof service
      );
    }
  } catch (err) {
    log(
      "Service require error: " +
      err.message
    );
  }

  log("");
  log("Service function names detected:");

  const fnRegex =
    /(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]\s*(?:async\s*)?(?:function|\()/g;

  const names = new Set();

  let m;

  while ((m = fnRegex.exec(serviceText))) {
    names.add(m[1]);
  }

  [...names]
    .sort()
    .forEach(name => log(name));
}

log("");

/* -----------------------------------------------------------
   IMPORTANT API CONTEXT
----------------------------------------------------------- */

log("------------------------------------------------------------");
log("6. IMPORTANT ERROR API CONTEXT");
log("------------------------------------------------------------");

const importantApis = [
  "/api/warp-preparation/all",
  "/api/warp-preparation/evaluate",
  "/api/analytics",
  "/api/planning/next-plan/save"
];

for (const wanted of importantApis) {
  log("");
  log(`SEARCHING: ${wanted}`);

  for (const x of frontendApiRefs.filter(v =>
    normalizeApi(v.api).startsWith(wanted)
  )) {
    log(
      `FRONTEND ${x.file}:${x.line} -> ${x.api}`
    );
    log(`SOURCE: ${x.source}`);
  }

  for (const r of backendRoutes.filter(v =>
    normalizeApi(v.route).startsWith(wanted)
  )) {
    log(
      `BACKEND ${r.method} ${r.route} -> ${r.file}`
    );
  }
}

log("");

/* -----------------------------------------------------------
   PAGE / ROUTER FILES
----------------------------------------------------------- */

log("------------------------------------------------------------");
log("7. ROUTER / PAGE FILES");
log("------------------------------------------------------------");

for (const file of frontendFiles) {
  const name = path.basename(file).toLowerCase();

  if (
    name.includes("app.") ||
    name.includes("route") ||
    name.includes("router")
  ) {
    log(rel(file));
  }
}

log("");

/* -----------------------------------------------------------
   PRISMA
----------------------------------------------------------- */

log("------------------------------------------------------------");
log("8. DATABASE / PRISMA");
log("------------------------------------------------------------");

const prismaSchema = path.join(
  BACKEND,
  "prisma",
  "schema.prisma"
);

if (fs.existsSync(prismaSchema)) {
  const schema = readSafe(prismaSchema);

  const models = [];
  const modelRegex = /^\s*model\s+(\w+)\s*\{/gm;

  let m;

  while ((m = modelRegex.exec(schema))) {
    models.push(m[1]);
  }

  log(
    "Prisma models: " +
    models.sort().join(", ")
  );
} else {
  log("Prisma schema not found.");
}

log("");

/* -----------------------------------------------------------
   API TESTS
----------------------------------------------------------- */

async function testUrl(url, method = "GET") {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method,
      signal: controller.signal
    });

    clearTimeout(timer);

    let body = "";

    try {
      body = await response.text();
    } catch {}

    body = body
      .replace(/\s+/g, " ")
      .slice(0, 400);

    return {
      status: response.status,
      body
    };
  } catch (err) {
    return {
      status: "ERROR",
      body: err.message
    };
  }
}

log("------------------------------------------------------------");
log("9. LOCAL API TEST");
log("------------------------------------------------------------");

const localTests = [
  ["GET", "http://localhost:3000/api/system-health"],
  ["GET", "http://localhost:3000/api/looms"],
  ["GET", "http://localhost:3000/api/orders"],
  ["GET", "http://localhost:3000/api/warp-preparation/all"],
  ["GET", "http://localhost:3000/api/analytics"]
];

(async () => {
  for (const [method, url] of localTests) {
    const result = await testUrl(url, method);

    log(
      `${method} ${url} -> ${result.status}`
    );

    if (result.body) {
      log(`BODY: ${result.body}`);
    }
  }

  log("");

  log("------------------------------------------------------------");
  log("10. PRODUCTION API TEST");
  log("------------------------------------------------------------");

  const productionBase =
    "https://spupl-loom-planning-erp.vercel.app";

  const productionTests = [
    ["GET", `${productionBase}/api/system-health`],
    ["GET", `${productionBase}/api/looms`],
    ["GET", `${productionBase}/api/orders`],
    ["GET", `${productionBase}/api/warp-preparation/all`],
    ["GET", `${productionBase}/api/analytics`]
  ];

  for (const [method, url] of productionTests) {
    const result = await testUrl(url, method);

    log(
      `${method} ${url} -> ${result.status}`
    );

    if (result.body) {
      log(`BODY: ${result.body}`);
    }
  }

  log("");

  log("============================================================");
  log("AUDIT COMPLETE");
  log("============================================================");

  fs.writeFileSync(
    REPORT,
    lines.join("\r\n"),
    "utf8"
  );

  console.log("");
  console.log("REPORT CREATED:");
  console.log(REPORT);
})();