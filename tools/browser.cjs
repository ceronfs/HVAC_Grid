// Headless browser for HVAC Grid tools (Playwright). Install once: npm install (devDependency playwright-core - no browser
// download, it drives the installed Microsoft Edge). PLAYWRIGHT_MODULE overrides the package path; a Playwright
// install already on this PC is the last fallback. Browser channel: msedge (HVAC_GRID_BROWSER to change, e.g. chrome);
// HVAC_GRID_BROWSER_PATH: a browser executable instead (a Chromium build on a test machine without Edge). With neither
// set and no Edge (a Linux cloud runner), Playwright's own Chromium is tried (npx playwright-core install chromium).
'use strict';
const path = require('path');
const FALLBACK = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright');
function playwright() {
 for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright', FALLBACK].filter(Boolean)) { try { return require(candidate); } catch {} }
 throw new Error('Playwright를 찾지 못했습니다. npm install 후 다시 실행하거나 PLAYWRIGHT_MODULE에 경로를 지정하세요.');
}
async function launch(options = {}) {
 const { chromium } = playwright(), env = process.env;
 if (env.HVAC_GRID_BROWSER_PATH) return chromium.launch({ executablePath: env.HVAC_GRID_BROWSER_PATH, headless: true, ...options });
 try { return await chromium.launch({ channel: env.HVAC_GRID_BROWSER || 'msedge', headless: true, ...options }); }
 catch (e) { if (env.HVAC_GRID_BROWSER) throw e; return chromium.launch({ headless: true, ...options }).catch(() => { throw e; }); }
}
const vendor = name => path.join(__dirname, '..', 'vendor', name);
module.exports = { launch, vendor };
