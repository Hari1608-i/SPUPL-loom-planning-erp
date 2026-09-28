
const fs = require('fs');
const path = require('path');

const file = path.join(
  process.cwd(),
  'frontend',
  'src',
  'pages',
  'MainEntry.tsx'
);

const backup = file + '.backup-runtime-fix';

let source = fs.readFileSync(file, 'utf8');

fs.copyFileSync(file, backup);

const old1 =
`const cascadedPlans = nextPlansList.map((plan, idx) => {`;

const new1 =
`let previousRunout: Date | null = null;
const cascadedPlans = nextPlansList.map((plan, idx) => {`;

const old2 =
`expectedStart = addDays(cascadedPlans[idx - 1].expectedRunout, 1);`;

const new2 =
`expectedStart = addDays(previousRunout || calc.expectedRunoutDate, 1);`;

const old3 =
`const expectedRunout = addDays(expectedStart, Math.ceil(planBalanceDays));`;

const new3 =
`const expectedRunout = addDays(expectedStart, Math.ceil(planBalanceDays));
                  previousRunout = expectedRunout;`;

if (!source.includes(old1)) {
  console.error('ERROR: cascadedPlans declaration not found.');
  process.exit(1);
}

if (!source.includes(old2)) {
  console.error('ERROR: cascadedPlans self-reference not found.');
  process.exit(1);
}

if (!source.includes(old3)) {
  console.error('ERROR: expectedRunout calculation not found.');
  process.exit(1);
}

source = source.replace(old1, new1);
source = source.replace(old2, new2);
source = source.replace(old3, new3);

fs.writeFileSync(file, source, 'utf8');

console.log('==============================================');
console.log('cascadedPlans RUNTIME FIX APPLIED');
console.log('==============================================');
console.log('Backup:');
console.log(backup);
console.log('');
console.log('Changes made:');
console.log('1. Added previousRunout variable');
console.log('2. Removed self-reference to cascadedPlans');
console.log('3. Updates previousRunout after each plan');