// Headless browser for HVAC Grid tools (Playwright). PLAYWRIGHT_MODULE overrides the package path; the fallback is
// the local Playwright install already used on this PC. Browser channel: msedge (HVAC_GRID_BROWSER to change).
'use strict';
const path = require('path');
const FALLBACK = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright');
function playwright() {
 for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', FALLBACK].filter(Boolean)) { try { return require(candidate); } catch {} }
 throw new Error('Playwright를 찾지 못했습니다. PLAYWRIGHT_MODULE에 경로를 지정하세요.');
}
const launch = (options = {}) => playwright().chromium.launch({ channel: process.env.HVAC_GRID_BROWSER || 'msedge', headless: true, ...options });
const vendor = name => path.join(__dirname, '..', 'vendor', name);
module.exports = { launch, vendor };
