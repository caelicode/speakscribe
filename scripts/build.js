#!/usr/bin/env node
/**
 * SpeakScribe Build Script
 *
 * Usage:
 *   node scripts/build.js                       # Production build (no owner key)
 *   node scripts/build.js --owner-key "SECRET"   # Dev build with owner bypass
 *   OWNER_KEY="SECRET" node scripts/build.js     # Dev build via env var
 *
 * This script copies js/license.js into a dist/ folder, optionally injecting
 * the owner bypass key for local development. The production build ships with
 * OWNER_KEY set to null, so no bypass is possible.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LICENSE_SRC = path.join(ROOT, 'js', 'license.js');

// Parse --owner-key from CLI args, or fall back to OWNER_KEY env var
let ownerKey = null;
const keyArgIdx = process.argv.indexOf('--owner-key');
if (keyArgIdx !== -1 && process.argv[keyArgIdx + 1]) {
  ownerKey = process.argv[keyArgIdx + 1];
} else if (process.env.OWNER_KEY) {
  ownerKey = process.env.OWNER_KEY;
}

// Read source
let licenseSource = fs.readFileSync(LICENSE_SRC, 'utf-8');

if (ownerKey) {
  // Replace the placeholder with the actual key (dev build only)
  licenseSource = licenseSource.replace(
    /const OWNER_KEY = null; \/\/ __OWNER_KEY_PLACEHOLDER__/,
    `const OWNER_KEY = '${ownerKey.replace(/'/g, "\\'")}'; // __OWNER_KEY_PLACEHOLDER__`
  );
  console.log('[build] Owner key injected for development build.');
} else {
  console.log('[build] Production build: owner key remains null.');
}

// Write the processed file back (or to a dist folder if you prefer)
// For simplicity, we write to a dist/ directory
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}
const DIST_JS = path.join(DIST, 'js');
if (!fs.existsSync(DIST_JS)) {
  fs.mkdirSync(DIST_JS, { recursive: true });
}

fs.writeFileSync(path.join(DIST_JS, 'license.js'), licenseSource, 'utf-8');
console.log('[build] Written to dist/js/license.js');

// Copy remaining files that don't need transformation
const filesToCopy = [
  'manifest.json',
  'js/background.js',
  'js/content.js',
  'js/defaults.js',
  'js/floating.js',
  'js/offscreen.js',
  'js/options.js',
  'js/popup.js',
  'js/punctuation.js',
  'js/punctuation-module.js',
  'js/deepgram-engine.js',
  'js/speech-engine.js',
  'js/theme.js',
  'js/upgrade.js',
];

for (const relPath of filesToCopy) {
  const src = path.join(ROOT, relPath);
  const dest = path.join(DIST, relPath);
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// Copy directories: css, icons, pages
const dirsToCopy = ['css', 'icons', 'pages'];
for (const dir of dirsToCopy) {
  copyDirSync(path.join(ROOT, dir), path.join(DIST, dir));
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('[build] Build complete. Output in dist/');
