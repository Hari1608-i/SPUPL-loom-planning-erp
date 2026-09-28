const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT = process.cwd();
const SERVER = path.join(ROOT, "backend", "upload_server.js");
const ANALYTICS = path.join(ROOT, "backend", "routes", "analytics.js");

function runGit(args) {
  return cp.execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8"
  });
}

function normalizeRoute(route) {
  let r = String(route || "").trim();

  r = r
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\[[^\]]+\]/g, ":param")
    .replace(/\/+$/, "");

  const q = r.indexOf("?");
  if (q >= 0) r = r.slice(0, q);

  return r;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routeStartsWith(actual, wanted) {
  const a = normalizeRoute(actual);
  const w = normalizeRoute(wanted);

  return a === w ||
    a.startsWith(w + "/");
}

function findFrontendApis() {
  const frontend = path.join(ROOT, "frontend", "src");
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        item.name === "node_modules" ||
        item.name === "dist" ||
        item.name === ".git"
      ) continue;

      const full = path.join(dir, item.name);

      if (item.isDirectory()) {
        walk(full);
      } else if (/\.(js|jsx|ts|tsx)$/.test(item.name)) {
        files.push(full);
      }
    }
  }

  walk(frontend);

  const found = new Set();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");

    const matches = text.match(
      /\/api\/[A-Za-z0-9_./:${}\-?=&[\]%]+/g
    );

    if (!matches) continue;

    for (const m of matches) {
      if (m === "/api/...") continue;

      const cleaned = m
        .replace(/[),"'`]+$/g, "")
        .replace(/\$\{[^}]+\}/g, ":param");

      if (cleaned.startsWith("/api/")) {
        found.add(normalizeRoute(cleaned));
      }
    }
  }

  return [...found].sort();
}

function findCurrentRoutes(text) {
  const routes = [];

  const re =
    /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;

  let m;

  while ((m = re.exec(text))) {
    routes.push({
      method: m[1].toUpperCase(),
      route: normalizeRoute(m[3])
    });
  }

  return routes;
}

function extractRouteBlock(text, method, route) {
  const routeRe = new RegExp(
    "\\bapp\\." +
      method.toLowerCase() +
      "\\s*\\(\\s*['\"]" +
      escapeRegex(route) +
      "['\"]"
  );

  const match = routeRe.exec(text);

  if (!match) return null;

  let start = match.index;

  let braceStart = text.indexOf("{", match.index);

  if (braceStart < 0) return null;

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = braceStart; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (c === "*" && n === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inSingle) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (c === "\\") {
        escaped = true;
        continue;
      }

      if (c === "'") {
        inSingle = false;
      }

      continue;
    }

    if (inDouble) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (c === "\\") {
        escaped = true;
        continue;
      }

      if (c === '"') {
        inDouble = false;
      }

      continue;
    }

    if (inTemplate) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (c === "\\") {
        escaped = true;
        continue;
      }

      if (c === "`") {
        inTemplate = false;
      }

      continue;
    }

    if (c === "/" && n === "/") {
      inLineComment = true;
      i++;
      continue;
    }

    if (c === "/" && n === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    if (c === "'") {
      inSingle = true;
      continue;
    }

    if (c === '"') {
      inDouble = true;
      continue;
    }

    if (c === "`") {
      inTemplate = true;
      continue;
    }

    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;

      if (depth === 0) {
        let end = i + 1;

        while (end < text.length && /\s/.test(text[end])) {
          end++;
        }

        if (text[end] === ")") {
          end++;

          while (end < text.length && /\s/.test(text[end])) {
            end++;
          }

          if (text[end] === ";") {
            end++;
          }
        }

        return text.slice(start, end).trim();
      }
    }
  }

  return null;
}

function getHistoricalCommits() {
  const raw = runGit([
    "log",
    "--all",
    "--format=%H",
    "--",
    "backend/upload_server.js"
  ]);

  return raw
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function getHistoricalFile(commit) {
  try {
    return runGit([
      "show",
      `${commit}:backend/upload_server.js`
    ]);
  } catch {
    return null;
  }
}

function findBestHistoricalRoute(wantedRoute, commits) {
  for (const commit of commits) {
    const text = getHistoricalFile(commit);

    if (!text) continue;

    const routes = findCurrentRoutes(text);

    const candidates = routes
      .filter(r =>
        routeStartsWith(r.route, wantedRoute)
      )
      .sort((a, b) =>
        b.route.length - a.route.length
      );

    for (const candidate of candidates) {
      const block = extractRouteBlock(
        text,
        candidate.method,
        candidate.route
      );

      if (block) {
        return {
          commit,
          method: candidate.method,
          route: candidate.route,
          block
        };
      }
    }
  }

  return null;
}

function insertionPoint(text) {
  const patterns = [
    /app\.use\s*\(\s*\(req,\s*res[^)]*\)\s*=>\s*\{[\s\S]*?API endpoint/i,
    /module\.exports\s*=\s*app\s*;/,
    /if\s*\(\s*!process\.env\.VERCEL\s*\)/
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m.index;
  }

  return text.length;
}

function ensureAnalyticsMount(text) {
  if (!fs.existsSync(ANALYTICS)) {
    return {
      text,
      changed: false,
      message: "analytics.js not found"
    };
  }

  const alreadyMounted =
    /app\.use\s*\(\s*['"`]\/api\/analytics['"`]/.test(text);

  if (alreadyMounted) {
    return {
      text,
      changed: false,
      message: "Analytics router already mounted"
    };
  }

  const requireLine =
    "const analyticsRouter = require('./routes/analytics');\n";

  if (!text.includes("const analyticsRouter = require('./routes/analytics');")) {
    const importMatch = text.match(
      /(?:^|\n)(const|let|var)\s+\w+\s*=\s*require\([^)]+\);/
    );

    if (importMatch) {
      const pos = importMatch.index + importMatch[0].length;

      text =
        text.slice(0, pos) +
        "\n" +
        requireLine +
        text.slice(pos);
    } else {
      text =
        requireLine +
        "\n" +
        text;
    }
  }

  const mountLine =
    "app.use('/api/analytics', analyticsRouter);\n";

  const point = text.search(
    /\/\/\s*-+\s*\n\/\/\s*SYSTEM HEALTH|app\.get\s*\(\s*['"]\//
  );

  const insertAt = point >= 0 ? point : 0;

  text =
    text.slice(0, insertAt) +
    mountLine +
    "\n" +
    text.slice(insertAt);

  return {
    text,
    changed: true,
    message: "Analytics router mounted at /api/analytics"
  };
}

/* ------------------------------------------------------- */

console.log("============================================================");
console.log("SPUPL API ROUTE RECOVERY");
console.log("============================================================");

if (!fs.existsSync(SERVER)) {
  throw new Error("backend/upload_server.js not found");
}

const original = fs.readFileSync(SERVER, "utf8");

const backup =
  SERVER +
  ".backup-before-api-recovery-" +
  Date.now();

fs.writeFileSync(backup, original, "utf8");

console.log("Backup:");
console.log(backup);
console.log("");

let currentText = original;

const frontendApis = findFrontendApis();
const currentRoutes = findCurrentRoutes(currentText);

console.log(
  "Frontend API references:",
  frontendApis.length
);

console.log(
  "Current backend explicit routes:",
  currentRoutes.length
);

console.log("");

const missing = frontendApis.filter(wanted => {
  return !currentRoutes.some(r =>
    routeStartsWith(r.route, wanted)
  );
});

console.log(
  "Potential missing API routes:",
  missing.length
);

console.log("");

/* -------------------------------------------------------
   ANALYTICS ROUTER
------------------------------------------------------- */

const analyticsResult =
  ensureAnalyticsMount(currentText);

currentText = analyticsResult.text;

console.log("ANALYTICS:");
console.log(analyticsResult.message);
console.log("");

/* -------------------------------------------------------
   HISTORICAL ROUTE RECOVERY
------------------------------------------------------- */

const commits = getHistoricalCommits();

console.log(
  "Git history versions scanned:",
  commits.length
);

console.log("");

const recovered = [];
const notRecovered = [];

for (const wanted of missing) {
  if (wanted === "/api/...") continue;

  console.log(
    "SEARCH:",
    wanted
  );

  const found =
    findBestHistoricalRoute(
      wanted,
      commits
    );

  if (!found) {
    console.log(
      "  NOT FOUND IN GIT HISTORY"
    );

    notRecovered.push(wanted);
    continue;
  }

  const alreadyPresent =
    findCurrentRoutes(currentText).some(r =>
      r.method === found.method &&
      r.route === found.route
    );

  if (alreadyPresent) {
    console.log(
      "  ALREADY PRESENT:",
      found.method,
      found.route
    );
    continue;
  }

  recovered.push(found);

  console.log(
    "  RECOVERED:",
    found.method,
    found.route,
    "FROM",
    found.commit
  );
}

console.log("");

/* -------------------------------------------------------
   INSERT RECOVERED ROUTES
------------------------------------------------------- */

if (recovered.length) {
  const point = insertionPoint(currentText);

  const section =
    "\n\n// ============================================================\n" +
    "// RECOVERED API ROUTES FROM PROJECT GIT HISTORY\n" +
    "// ============================================================\n\n" +
    recovered
      .map(x =>
        `// Recovered from commit ${x.commit}\n${x.block}\n`
      )
      .join("\n");

  currentText =
    currentText.slice(0, point) +
    section +
    "\n" +
    currentText.slice(point);
}

/* -------------------------------------------------------
   WRITE ONLY IF CHANGED
------------------------------------------------------- */

if (currentText !== original) {
  fs.writeFileSync(
    SERVER,
    currentText,
    "utf8"
  );

  console.log(
    "upload_server.js UPDATED"
  );
} else {
  console.log(
    "No upload_server.js changes required"
  );
}

console.log("");

console.log(
  "Recovered routes:",
  recovered.length
);

recovered.forEach(x =>
  console.log(
    " +",
    x.method,
    x.route
  )
);

console.log("");

console.log(
  "Not recovered from history:",
  notRecovered.length
);

notRecovered.forEach(x =>
  console.log(
    " -",
    x
  )
);

console.log("");

/* -------------------------------------------------------
   SYNTAX TEST
------------------------------------------------------- */

console.log(
  "Checking backend JavaScript syntax..."
);

try {
  cp.execFileSync(
    process.execPath,
    ["--check", SERVER],
    {
      cwd: ROOT,
      stdio: "pipe"
    }
  );

  console.log(
    "SYNTAX CHECK: PASS"
  );
} catch (err) {
  console.log(
    "SYNTAX CHECK: FAILED"
  );

  if (err.stdout) {
    console.log(err.stdout.toString());
  }

  if (err.stderr) {
    console.log(err.stderr.toString());
  }

  console.log("");
  console.log(
    "Restoring backup because syntax failed..."
  );

  fs.copyFileSync(
    backup,
    SERVER
  );

  process.exit(1);
}

console.log("");

console.log("============================================================");
console.log("RECOVERY FINISHED");
console.log("============================================================");