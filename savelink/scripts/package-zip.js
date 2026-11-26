const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const unpackedDir = path.join(distDir, 'win-unpacked');
const v1Dir = path.join(distDir, 'SaveLink-version-1');
const zipPath = path.join(distDir, 'SaveLink-version-1.zip');

console.log('--- Packaging SaveLink Version 1 ---');

if (!fs.existsSync(unpackedDir)) {
  console.error('Error: win-unpacked not found! Run electron-builder --win dir first.');
  process.exit(1);
}

// 1. Copy win-unpacked to SaveLink-version-1
if (fs.existsSync(v1Dir)) {
  fs.rmSync(v1Dir, { recursive: true, force: true });
}
fs.cpSync(unpackedDir, v1Dir, { recursive: true });
console.log('Created standalone folder: dist/SaveLink-version-1');

// 2. Remove old zip if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// 3. Compress using PowerShell Compress-Archive for 100% native Windows Explorer compatibility
console.log('Compressing with PowerShell Compress-Archive (native Windows format)...');
const psCmd = `Compress-Archive -Path "${v1Dir}" -DestinationPath "${zipPath}" -Force`;
execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });

const stats = fs.statSync(zipPath);
console.log(`Created dist/SaveLink-version-1.zip (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log('--- Packaging Complete ---');
