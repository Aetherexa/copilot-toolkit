const fs = require('fs');
const path = require('path');

const outputRoot = path.resolve(__dirname, '..', 'out-webview-test');
const nodeModules = path.join(outputRoot, 'node_modules');
const sharedLink = path.join(nodeModules, '@shared');
const sharedTarget = path.join(outputRoot, 'src');

fs.mkdirSync(nodeModules, { recursive: true });
fs.rmSync(sharedLink, { recursive: true, force: true });
fs.symlinkSync(
  sharedTarget,
  sharedLink,
  process.platform === 'win32' ? 'junction' : 'dir',
);
