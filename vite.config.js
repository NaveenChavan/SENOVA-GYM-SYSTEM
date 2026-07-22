import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The packaged Electron app loads dist/index.html via the file:// protocol
  // (see main.js -> mainWindow.loadFile). Under file://, an absolute asset
  // path like "/assets/index-....js" resolves against the filesystem root,
  // not against dist/, causing silent 404s post-package even though the same
  // build serves fine under the Vite dev server (http://localhost:5173) where
  // absolute paths resolve correctly. Relative paths work under both.
  base: "./",
  plugins: [react()],
  // NOTE on @vladmandic/face-api: it is intentionally NOT imported as a bare
  // module specifier anywhere in this app (see the long comment at the top of
  // src/services/faceRecognition.js). Vite 8's Rolldown-based import-analysis
  // transform textually mis-rewrites a legitimate class method literally
  // named `import` inside TensorFlow.js's bundled internals (HashTable's
  // `async import(keys, values) {...}`) into a broken dynamic-import call,
  // corrupting the file into invalid JS ("Unexpected token '('") — and this
  // reproduces identically whether the package is pre-bundled
  // (optimizeDeps.include) OR excluded (optimizeDeps.exclude), because Vite's
  // per-request dev-serve transform applies the same rewrite to any
  // node_modules file it serves through its module graph, not just files the
  // dependency optimizer pre-bundles. There is no optimizeDeps setting that
  // avoids this. The actual fix: the package's pre-built, fully
  // self-contained ESM bundle is copied to public/vendor/face-api.esm.js
  // (see package.json's "postinstall" — keep it in sync if the package is
  // ever upgraded) and loaded via a runtime import() of its resolved static-
  // asset URL, which Vite serves byte-for-byte untouched, both in dev and
  // copied verbatim into dist/ on build.
})
