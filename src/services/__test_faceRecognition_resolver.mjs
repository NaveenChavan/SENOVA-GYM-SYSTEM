// Node ESM loader hook: redirects the "@vladmandic/face-api" specifier to
// ./__mock_face-api.mjs. Registered by __test_faceRecognition.mjs via
// node:module's register() so the real face-api package (which needs the
// @tensorflow/tfjs-node native binding to run outside a browser) is never
// loaded during this unit test — see __mock_face-api.mjs for what it stands
// in for and why.
const MOCK_URL = new URL("./__mock_face-api.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@vladmandic/face-api") {
    return { url: MOCK_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
