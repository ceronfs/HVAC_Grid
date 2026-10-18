// Headless browser for HVAC Grid tools (Playwright). Install once: npm install (devDependency playwright-core - no browser
// download, it drives the installed Microsoft Edge). PLAYWRIGHT_MODULE overrides the package path; a Playwright
// install already on this PC is the last fallback. Browser channel: msedge (HVAC_GRID_BROWSER to change, e.g. chrome).
'use strict';
const path = require('path');
const FALLBACK = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright');
function playwright() {
 for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright', FALLBACK].filter(Boolean)) { try { return require(candidate); } catch {} }
 throw new Error('Playwright를 찾지 못했습니다. npm install 후 다시 실행하거나 PLAYWRIGHT_MODULE에 경로를 지정하세요.');
}
const launch = (options = {}) => playwright().chromium.launch({ channel: process.env.HVAC_GRID_BROWSER || 'msedge', headless: true, ...options });
const vendor = name => path.join(__dirname, '..', 'vendor', name);
module.exports = { launch, vendor };
