const fs = require('fs');
const path = require('path');

const file = path.join(
  process.cwd(),
  'frontend',
  'src',
  'pages',
  'MainEntry.tsx'
);

const backup = file + '.backup-cascadedPlans';

const source = fs.readFileSync(file, 'utf8');

if (!source.includes('const cascadedPlans')) {
  console.error('ERROR: const cascadedPlans was not found.');
  process.exit(1);
}

fs.copyFileSync(file, backup);

const declStart = source.indexOf('const cascadedPlans');

let i = declStart;
let paren = 0;
let brace = 0;
let bracket = 0;

let inSingle = false;
let inDouble = false;
let inTemplate = false;
let inLineComment = false;
let inBlockComment = false;
let escaped = false;

let declEnd = -1;

for (; i < source.length; i++) {
  const ch = source[i];
  const next = source[i + 1];

  if (inLineComment) {
    if (ch === '\n') {
      inLineComment = false;
    }
    continue;
  }

  if (inBlockComment) {
    if (ch === '*' && next === '/') {
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

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === "'") {
      inSingle = false;
    }
    continue;
  }

  if (inDouble) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inDouble = false;
    }
    continue;
  }

  if (inTemplate) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '`') {
      inTemplate = false;
    }
    continue;
  }

  if (ch === '/' && next === '/') {
    inLineComment = true;
    i++;
    continue;
  }

  if (ch === '/' && next === '*') {
    inBlockComment = true;
    i++;
    continue;
  }

  if (ch === "'") {
    inSingle = true;
    continue;
  }

  if (ch === '"') {
    inDouble = true;
    continue;
  }

  if (ch === '`') {
    inTemplate = true;
    continue;
  }

  if (ch === '(') paren++;
  else if (ch === ')') paren--;
  else if (ch === '{') brace++;
  else if (ch === '}') brace--;
  else if (ch === '[') bracket++;
  else if (ch === ']') bracket--;

  if (
    ch === ';' &&
    paren === 0 &&
    brace === 0 &&
    bracket === 0
  ) {
    declEnd = i + 1;
    break;
  }
}

if (declEnd === -1) {
  console.error(
    'ERROR: Could not safely determine the end of cascadedPlans declaration.'
  );
  process.exit(1);
}

let blockStart = declStart;
let blockEnd = declEnd;

while (
  blockEnd < source.length &&
  (source[blockEnd] === '\r' ||
    source[blockEnd] === '\n')
) {
  blockEnd++;
}

const declaration = source.slice(
  blockStart,
  blockEnd
);

// Remove original declaration
let newSource =
  source.slice(0, blockStart) +
  source.slice(blockEnd);

// Find the component render return.
// Use the last "  return (" in MainEntry.tsx.
const returnMarker = '\n  return (';
const returnIndex = newSource.lastIndexOf(returnMarker);

if (returnIndex === -1) {
  console.error(
    'ERROR: MainEntry render return was not found.'
  );
  process.exit(1);
}

// Insert cascadedPlans before render return.
newSource =
  newSource.slice(0, returnIndex + 1) +
  declaration +
  '\n' +
  newSource.slice(returnIndex + 1);

fs.writeFileSync(file, newSource, 'utf8');

console.log('==============================================');
console.log('MainEntry cascadedPlans FIX COMPLETED');
console.log('==============================================');
console.log('Backup created:');
console.log(backup);
console.log('');
console.log('cascadedPlans declaration moved before render.');