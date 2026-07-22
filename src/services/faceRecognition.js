/**
 * faceRecognition.js — renderer-side face recognition helpers.
 *
 * Wraps @vladmandic/face-api (maintained fork of face-api.js, on TensorFlow.js)
 * for the face-scan attendance flow:
 *   - loadModels()               → load bundled offline weights from /models
 *   - computeDescriptor(input)   → 128-d Float32Array face embedding, or null
 *   - detectAllFaceBoxes(input)  → cheap multi-face boxes (guard + UI guide)
 *   - descriptorToArray / arrayToDescriptor → DB (JSON) <-> Float32Array
 *   - buildMatcher(labeled, t)   → faceapi.FaceMatcher for nearest-neighbour match
 *
 * Models are served locally by Vite from `public/models` (offline-first — no CDN).
 * Recognition is a convenience layer, NOT anti-spoofing security: a printed photo
 * or a phone screen can defeat it. A fingerprint/liveness upgrade is the real fix.
 *
 * IMPORTANT — why @vladmandic/face-api is loaded from public/vendor, not a bare
 * "@vladmandic/face-api" import:
 * Vite 8's Rolldown-based import-analysis transform textually rewrites every
 * `identifier(` that looks like a dynamic import call — including
 * TensorFlow.js's internal HashTable class, which defines a real method
 * literally named `import` (`async import(keys, values) {...}`). Vite
 * mis-rewrites that into a broken `import(__vite__injectQuery(keys, 'import'),
 * values)` call, corrupting the bundle into invalid JS that throws
 * "Unexpected token '('" the instant it's imported — a genuine Rolldown
 * transform bug (see vitejs/rolldown-vite#540, vitejs/vite#18325 for the same
 * class of "transform touches code it shouldn't" issue), independent of
 * Node vs. browser environment detection. This reproduces identically whether
 * the package is pre-bundled (optimizeDeps.include) or excluded
 * (optimizeDeps.exclude) — Vite's *dev serve* transform (not just the
 * optimizer) applies the same broken rewrite to any node_modules file it
 * serves through its module graph. The only reliable fix is to route the
 * package's pre-built, fully self-contained ESM bundle
 * (dist/face-api.esm.js — no imports of its own, everything inlined) through
 * `public/vendor/face-api.esm.js` instead, which Vite serves as a byte-for-
 * byte-untouched static asset (both under the dev server and copied verbatim
 * into dist/ on build), and load it via a runtime `import()` of its resolved
 * URL rather than a bare module specifier Vite's transform would ever see.
 */
let faceapiPromise = null;
function loadFaceApi() {
  if (!faceapiPromise) {
    // In a real browser/renderer, resolve the vendored static-asset URL (see
    // the module docstring above for why). In a non-browser context (e.g.
    // this file's own Node-based unit tests), `document` doesn't exist —
    // fall back to the bare package specifier, which a test-only loader hook
    // can intercept and mock (see __test_faceRecognition.mjs +
    // __test_faceRecognition_resolver.mjs). This fallback is NEVER exercised
    // in the actual app, only in tests.
    const specifier =
      typeof document !== "undefined"
        ? new URL("vendor/face-api.esm.js", document.baseURI).href
        : "@vladmandic/face-api";
    faceapiPromise = import(/* @vite-ignore */ specifier);
  }
  return faceapiPromise;
}

// Models are served from the "models" directory relative to the document's
// own base URI. A hardcoded "/models" is ROOT-relative and would 404 under
// the packaged app's file:// protocol (base: "./" in vite.config.js only
// affects <script>/<link> tags emitted by Vite — it does NOT change the
// meaning of a literal "/models" string used at runtime by faceapi's
// fetch()). Resolving against document.baseURI makes this work identically
// under http://localhost:5173/, file:///…/dist/index.html, and any future
// custom protocol. Guarded for non-browser contexts (e.g. Node-based unit
// tests importing this module) where `document` does not exist.
const MODEL_URI =
  typeof document !== "undefined" ? new URL("models", document.baseURI).href : "/models";

// Euclidean-distance threshold for a confident match. Lower = stricter.
// face-api's typical operating range is ~0.4–0.6; 0.5 is the common default
// used by attendance projects and balances false accepts vs. false rejects.
export const MATCH_THRESHOLD = 0.5;

// Detector options are constructed lazily (need the faceapi module loaded
// first) and cached, tuned for a single, reasonably close face at a check-in
// gate.
let detectorOptionsCache = null;
function getDetectorOptions(faceapi) {
  if (!detectorOptionsCache) {
    detectorOptionsCache = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.5,
    });
  }
  return detectorOptionsCache;
}

let modelsPromise = null;

/**
 * Nudges face-api / TensorFlow.js into a BROWSER environment and picks a TF.js
 * backend. Kept as a harmless safety net / explicit backend selector — with
 * the renderer now running under nodeIntegration: false + contextIsolation:
 * true (see main.js + preload.js), face-api's own environment auto-detection
 * already resolves to "browser" correctly and permanently on its own; no
 * Node-globals hiding is needed here (there previously was some, in
 * AttendancePage.jsx/MembersPage.jsx/MembersList.jsx, working around the
 * renderer wrongly exposing real Node process/require/module/Buffer globals —
 * that workaround has been removed now that the root cause is fixed).
 *
 * `createBrowserEnv()` wires face-api to window.fetch / Image / <canvas>, and
 * pinning the TF.js backend to webgl (or cpu) avoids any Node backend path.
 */
async function forceBrowserEnvironment(faceapi) {
  try {
    if (faceapi.env?.setEnv && faceapi.env?.createBrowserEnv) {
      faceapi.env.setEnv(faceapi.env.createBrowserEnv());
    }
  } catch {
    // If the environment is already browser this is a harmless no-op.
  }
  try {
    if (faceapi.tf?.setBackend) {
      const ok = await faceapi.tf.setBackend("webgl").catch(() => false);
      if (ok === false) await faceapi.tf.setBackend("cpu").catch(() => {});
      if (faceapi.tf.ready) await faceapi.tf.ready();
    }
  } catch {
    // Best-effort backend init; detection will fall back on first op.
  }
}

/**
 * Loads the face-api module (from public/vendor, see the note above) and the
 * three required model sets once (idempotent). Safe to call on every mount —
 * subsequent calls return the same in-flight/settled promise.
 */
export function loadModels() {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const faceapi = await loadFaceApi();
    await forceBrowserEnvironment(faceapi);
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URI);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URI);
    return faceapi;
  })().catch((error) => {
    modelsPromise = null; // allow retry after a failed load
    throw error;
  });
  return modelsPromise;
}

export async function modelsLoaded() {
  const faceapi = await loadFaceApi();
  return (
    faceapi.nets.tinyFaceDetector.isLoaded &&
    faceapi.nets.faceLandmark68Net.isLoaded &&
    faceapi.nets.faceRecognitionNet.isLoaded
  );
}

/**
 * Runs one throwaway detection on a blank canvas to force TensorFlow.js to
 * initialize its backend and evaluate/cache its environment flags.
 */
export async function warmup() {
  const faceapi = await loadModels();
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  try {
    await faceapi.detectSingleFace(canvas, getDetectorOptions(faceapi)).withFaceLandmarks().withFaceDescriptor();
  } catch {
    // A blank canvas legitimately has no face; we only care about backend init.
  }
}

/**
 * Decodes a base64 data URL into an HTMLImageElement (used for the stored
 * registration photos).
 */
export function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the stored member photo."));
    image.src = dataUrl;
  });
}

/**
 * Computes a single-face 128-d descriptor from an image/video/canvas element.
 * Returns null when no face (or an undecodable input) is found.
 */
export async function computeDescriptor(input) {
  const faceapi = await loadModels();
  const detection = await faceapi
    .detectSingleFace(input, getDetectorOptions(faceapi))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor || null;
}

/**
 * Convenience: compute a descriptor directly from a base64 data URL.
 */
export async function computeDescriptorFromDataUrl(dataUrl) {
  const image = await imageFromDataUrl(dataUrl);
  return computeDescriptor(image);
}

/**
 * Detects every face in a live frame (video/canvas/image), for the multi-face
 * guard and the on-screen face-guide bounding box. Cheaper than the full
 * descriptor pipeline — no landmarks/descriptor extraction — so it is safe to
 * call on every animation frame for the live guide overlay.
 * @returns {Promise<Array<{ box: { x: number, y: number, width: number, height: number } }>>}
 */
export async function detectAllFaceBoxes(input) {
  const faceapi = await loadModels();
  const detections = await faceapi.detectAllFaces(input, getDetectorOptions(faceapi));
  return (detections || []).map((d) => ({ box: d.box }));
}

/** Float32Array (128) -> plain number[] for JSON/DB storage. */
export function descriptorToArray(descriptor) {
  return descriptor ? Array.from(descriptor) : null;
}

/** Stored JSON array/string -> Float32Array, or null when invalid. */
export function arrayToDescriptor(value) {
  let arr = value;
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length !== 128) return null;
  return Float32Array.from(arr);
}

/**
 * Builds a FaceMatcher from labeled descriptors.
 * @param {Array<{label: string, descriptors: Float32Array[]}>} labeled
 * @param {number} threshold
 */
export async function buildMatcher(labeled, threshold = MATCH_THRESHOLD) {
  try {
    const faceapi = await loadFaceApi();
    const labeledDescriptors = labeled
      .filter((entry) => entry.descriptors?.length)
      .map((entry) => new faceapi.LabeledFaceDescriptors(entry.label, entry.descriptors));
    if (!labeledDescriptors.length) return null;
    return new faceapi.FaceMatcher(labeledDescriptors, threshold);
  } catch (error) {
    // Prefixed distinctly from [face-v2/engine] / [face-v2/models] so a
    // matcher construction failure (e.g. malformed descriptor data) is not
    // confused with a model-load or camera-permission failure in the UI.
    const wrapped = new Error(`[face-v2/matcher] ${error.message || error}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

/**
 * Matches a live descriptor against a prebuilt matcher.
 * @returns {{ label: string, distance: number, matched: boolean } | null}
 */
export function matchDescriptor(matcher, descriptor) {
  if (!matcher || !descriptor) return null;
  const best = matcher.findBestMatch(descriptor);
  return {
    label: best.label,
    distance: best.distance,
    matched: best.label !== "unknown",
  };
}
