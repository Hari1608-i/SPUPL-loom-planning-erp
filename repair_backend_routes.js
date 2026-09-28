const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = __dirname;
const serverFile = path.join(root, 'backend', 'upload_server.js');
const schemaFile = path.join(root, 'backend', 'prisma', 'schema.prisma');

console.log('============================================================');
console.log('SPUPL BACKEND SAFE REPAIR + WARP DIAGNOSTIC');
console.log('============================================================');

if (!fs.existsSync(serverFile)) {
  throw new Error(`upload_server.js not found: ${serverFile}`);
}

let content = fs.readFileSync(serverFile, 'utf8');

const timestamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);

const backupFile =
  `${serverFile}.backup-before-safe-repair-${timestamp}`;

fs.copyFileSync(serverFile, backupFile);

console.log('');
console.log('Backup created:');
console.log(backupFile);

/* ------------------------------------------------------------
   1. Ensure warpPreparationService import
------------------------------------------------------------ */

const warpImport =
  "const warpPreparationService = require('./services/warpPreparationService');";

if (!content.includes(warpImport)) {

  const prismaAnchor =
    "const prisma = require('./prismaClient');";

  if (!content.includes(prismaAnchor)) {
    throw new Error('Prisma import anchor not found.');
  }

  content = content.replace(
    prismaAnchor,
    `${prismaAnchor}\n${warpImport}`
  );

  console.log('PASS: warpPreparationService import added.');
} else {
  console.log('PASS: warpPreparationService import already exists.');
}

/* ------------------------------------------------------------
   2. Ensure PATCH is allowed by CORS
------------------------------------------------------------ */

const corsOld =
  "methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']";

const corsNew =
  "methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']";

if (content.includes(corsOld)) {
  content = content.replace(corsOld, corsNew);
  console.log('PASS: PATCH added to CORS methods.');
} else if (
  content.includes("methods:") &&
  content.includes("'PATCH'")
) {
  console.log('PASS: PATCH already present in CORS.');
} else {
  console.log('INFO: CORS methods pattern not changed.');
}

/* ------------------------------------------------------------
   3. Add missing GET /api/sizing/requests
------------------------------------------------------------ */

const sizingRouteMarker =
  "app.get('/api/sizing/requests'";

if (!content.includes(sizingRouteMarker)) {

  const sizingRoute = `
// ----------------------------------------------------
// SIZING REQUESTS - LIST
// ----------------------------------------------------

app.get('/api/sizing/requests', async (req, res) => {
  try {
    const requests =
      await prisma.beamPreparationRequest.findMany({
        orderBy: [
          { target_date: 'asc' },
          { id: 'asc' }
        ]
      });

    return res.json(requests || []);
  } catch (error) {
    console.error(
      'Sizing requests GET error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message ||
        'Failed to load sizing requests.'
    });
  }
});

`;

  const api404Marker =
    "// API 404 HANDLER";

  const markerIndex = content.indexOf(api404Marker);

  if (markerIndex === -1) {
    throw new Error(
      'API 404 HANDLER marker not found. Refusing unsafe edit.'
    );
  }

  content =
    content.slice(0, markerIndex) +
    sizingRoute +
    content.slice(markerIndex);

  console.log(
    'PASS: GET /api/sizing/requests added.'
  );

} else {
  console.log(
    'PASS: GET /api/sizing/requests already exists.'
  );
}

/* ------------------------------------------------------------
   4. Save
------------------------------------------------------------ */

fs.writeFileSync(
  serverFile,
  content,
  'utf8'
);

console.log('');
console.log('upload_server.js saved.');

/* ------------------------------------------------------------
   5. JavaScript syntax check
------------------------------------------------------------ */

console.log('');
console.log('===== SYNTAX CHECK =====');

function checkSyntax(file) {

  const result = cp.spawnSync(
    process.execPath,
    ['--check', file],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {

    console.error(result.stdout || '');
    console.error(result.stderr || '');

    return false;
  }

  return true;
}

if (!checkSyntax(serverFile)) {

  console.log('');
  console.log(
    'upload_server.js syntax failed. Restoring backup...'
  );

  fs.copyFileSync(
    backupFile,
    serverFile
  );

  throw new Error(
    'Repair cancelled and backup restored.'
  );
}

console.log(
  'PASS: upload_server.js syntax.'
);

if (fs.existsSync(schemaFile)) {

  const result = cp.spawnSync(
    process.execPath,
    [
      '--check',
      path.join(
        root,
        'backend',
        'services',
        'warpPreparationService.js'
      )
    ],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {

    console.error(result.stderr || '');

    throw new Error(
      'warpPreparationService.js syntax check failed.'
    );
  }

  console.log(
    'PASS: warpPreparationService.js syntax.'
  );
}

/* ------------------------------------------------------------
   6. Prisma delegate check
------------------------------------------------------------ */

console.log('');
console.log('===== PRISMA CLIENT CHECK =====');

let prismaCheck = cp.spawnSync(
  process.execPath,
  [
    '-e',
    `
require('dotenv').config();

const prisma = require('./backend/prismaClient');

console.log(
  'warpPreparationProcess delegate:',
  !!prisma.warpPreparationProcess
);

console.log(
  'beamPreparationRequest delegate:',
  !!prisma.beamPreparationRequest
);
`
  ],
  {
    cwd: root,
    encoding: 'utf8'
  }
);

console.log(
  prismaCheck.stdout || ''
);

if (prismaCheck.stderr) {
  console.log(prismaCheck.stderr);
}

/* ------------------------------------------------------------
   7. Regenerate Prisma client if required
------------------------------------------------------------ */

const delegateOutput =
  prismaCheck.stdout || '';

const warpDelegateMissing =
  delegateOutput.includes(
    'warpPreparationProcess delegate: false'
  );

const sizingDelegateMissing =
  delegateOutput.includes(
    'beamPreparationRequest delegate: false'
  );

if (
  warpDelegateMissing ||
  sizingDelegateMissing
) {

  console.log('');
  console.log(
    'Prisma client is missing one or more required delegates.'
  );

  console.log(
    'Running Prisma generate...'
  );

  const generate = cp.spawnSync(
    'npx',
    [
      'prisma',
      'generate',
      '--schema',
      schemaFile
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: true
    }
  );

  console.log(
    generate.stdout || ''
  );

  if (generate.stderr) {
    console.log(generate.stderr);
  }

  if (generate.status !== 0) {
    throw new Error(
      'Prisma generate failed.'
    );
  }

  console.log(
    'PASS: Prisma client regenerated.'
  );
} else {
  console.log(
    'PASS: Required Prisma delegates are present.'
  );
}

/* ------------------------------------------------------------
   8. Direct Warp service diagnostic
   READ ONLY - NO INSERT / UPDATE / DELETE
------------------------------------------------------------ */

console.log('');
console.log('===== WARP SERVICE DIRECT TEST =====');

const diagnosticCode = `
require('dotenv').config();

(async () => {

  try {

    const prisma =
      require('./backend/prismaClient');

    const service =
      require('./backend/services/warpPreparationService');

    console.log('');
    console.log('EXPORTED SERVICE FUNCTIONS:');
    console.log(
      Object.keys(service)
    );

    console.log('');
    console.log(
      'warpPreparationProcess delegate:',
      !!prisma.warpPreparationProcess
    );

    console.log(
      'beamPreparationRequest delegate:',
      !!prisma.beamPreparationRequest
    );

    console.log('');
    console.log(
      'Running getAllActivePreparationRecords()...'
    );

    const result =
      await service.getAllActivePreparationRecords();

    console.log('');
    console.log(
      'WARP SERVICE RESULT: PASS'
    );

    console.log(
      'allRecords:',
      Array.isArray(result?.allRecords)
        ? result.allRecords.length
        : 'not-array'
    );

    console.log(
      'latestByLoom:',
      result?.latestByLoom
        ? Object.keys(result.latestByLoom).length
        : 'not-present'
    );

    await prisma.$disconnect();

    process.exit(0);

  } catch (error) {

    console.log('');
    console.log(
      'WARP SERVICE RESULT: FAIL'
    );

    console.log(
      'ERROR NAME:',
      error.name || ''
    );

    console.log(
      'ERROR MESSAGE:',
      error.message || ''
    );

    console.log('');
    console.log(
      'ERROR STACK:'
    );

    console.log(
      error.stack || ''
    );

    process.exit(1);
  }

})();
`;

const diagnostic =
  cp.spawnSync(
    process.execPath,
    ['-e', diagnosticCode],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );

console.log(
  diagnostic.stdout || ''
);

if (diagnostic.stderr) {
  console.log(
    diagnostic.stderr
  );
}

console.log('');
console.log(
  '============================================================'
);
console.log(
  'SAFE REPAIR COMPLETED'
);
console.log(
  '============================================================'
);
console.log('');
console.log(
  'No ERP database records were inserted, updated, or deleted.'
);
console.log('');
console.log(
  'Next: restart backend and test the APIs.'
);