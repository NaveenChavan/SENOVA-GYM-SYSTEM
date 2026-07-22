// scripts/sync-face-api-vendor.js
//
// Copies @vladmandic/face-api's pre-built, fully self-contained browser ESM
// bundle (node_modules/@vladmandic/face-api/dist/face-api.esm.js) into
// public/vendor/face-api.esm.js.
//
// WHY THIS EXISTS: see the long comment at the top of
// src/services/faceRecognition.js. Short version — Vite 8's Rolldown-based
// import-analysis transform mis-rewrites a legitimate class method literally
// named `import` inside this bundle's inlined TensorFlow.js internals into a
// broken dynamic-import call, corrupting the file the instant Vite's dev
// server or build pipeline touches it as a module. Serving it as an
// untouched static asset from public/ (Vite copies public/ verbatim, both to
// the dev server and into dist/ on build) sidesteps the transform entirely.
//
// Run automatically via package.json's "postinstall" script, and manually via
// `npm run sync:face-api` after upgrading the @vladmandic/face-api version.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "node_modules", "@vladmandic", "face-api", "dist", "face-api.esm.js");
const DEST_DIR = path.join(__dirname, "..", "public", "vendor");
const DEST = path.join(DEST_DIR, "face-api.esm.js");

function main() {
  if (!fs.existsSync(SRC)) {
    console.warn(
      `[sync-face-api-vendor] Source file not found: ${SRC}\n` +
        `  Skipping — this is expected if @vladmandic/face-api hasn't been installed yet ` +
        `(e.g. a partial/offline install). Face Scan will not work until this file exists ` +
        `at public/vendor/face-api.esm.js; re-run "npm install" or "npm run sync:face-api".`,
    );
    return;
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.copyFileSync(SRC, DEST);
  const { size } = fs.statSync(DEST);
  console.log(`[sync-face-api-vendor] Copied face-api.esm.js -> public/vendor/ (${size} bytes)`);
}

main();
