const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Auto-detect root directory whether Vercel executes from root or inside frontend
let rootDir = process.cwd();
if (!fs.existsSync(path.join(rootDir, 'backend')) && fs.existsSync(path.join(rootDir, '..', 'backend'))) {
  rootDir = path.resolve(rootDir, '..');
}

console.log('====================================================');
console.log('SPUPL ERP AUTOMATED BUILD PIPELINE');
console.log('Root Directory:', rootDir);
console.log('====================================================');

const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

// 1. Backend setup & Prisma generation
console.log('\n[1/2] Generating Prisma client in backend...');
execSync('npm install --prefix backend', { cwd: rootDir, stdio: 'inherit' });
execSync('npx prisma generate', { cwd: backendDir, stdio: 'inherit' });

// 2. Frontend build
console.log('\n[2/2] Building Vite frontend application...');
execSync('npm install --prefix frontend', { cwd: rootDir, stdio: 'inherit' });
execSync('npm run build --prefix frontend', { cwd: rootDir, stdio: 'inherit' });

console.log('\n✓ All build steps completed successfully!');
