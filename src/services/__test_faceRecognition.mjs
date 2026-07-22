// Hardening 7: basic automated coverage for faceRecognition.js.
//
// Covers descriptorToArray/arrayToDescriptor round-tripping and
// buildMatcher/matchDescriptor against fixed known-good descriptor fixtures.
// Does not run the real TF.js models — a loader hook (registered below)
// substitutes a minimal mock of @vladmandic/face-api's LabeledFaceDescriptors
// and FaceMatcher (see __mock_face-api.mjs) so this test has no dependency on
// the @tensorflow/tfjs-node native binding, which this Electron-renderer-only
// app does not otherwise install.
//
// Run with: node src/services/__test_faceRecognition.mjs
import assert from "node:assert";
import { register } from "node:module";

register(new URL("./__test_faceRecognition_resolver.mjs", import.meta.url));

async function run() {
  const lib = await import("./faceRecognition.js");
  const {
    descriptorToArray,
    arrayToDescriptor,
    buildMatcher,
    matchDescriptor,
    MATCH_THRESHOLD,
  } = lib;

  // ── descriptorToArray / arrayToDescriptor round-trip ──────────────────
  const original = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i) * 0.1);

  const asArray = descriptorToArray(original);
  assert(Array.isArray(asArray), "descriptorToArray must return a plain array");
  assert.strictEqual(asArray.length, 128);
  assert.strictEqual(descriptorToArray(null), null, "descriptorToArray(null) must be null");

  const roundTripped = arrayToDescriptor(asArray);
  assert(roundTripped instanceof Float32Array, "arrayToDescriptor must return a Float32Array");
  assert.strictEqual(roundTripped.length, 128);
  for (let i = 0; i < 128; i++) {
    assert.ok(Math.abs(roundTripped[i] - original[i]) < 1e-6, `value at index ${i} should round-trip`);
  }

  // arrayToDescriptor must also accept a JSON string (the DB storage shape).
  const fromJsonString = arrayToDescriptor(JSON.stringify(asArray));
  assert(fromJsonString instanceof Float32Array);
  assert.strictEqual(fromJsonString.length, 128);

  // Invalid inputs must return null, not throw.
  assert.strictEqual(arrayToDescriptor(null), null);
  assert.strictEqual(arrayToDescriptor(undefined), null);
  assert.strictEqual(arrayToDescriptor("not json"), null);
  assert.strictEqual(arrayToDescriptor([1, 2, 3]), null, "wrong length must be rejected");
  assert.strictEqual(arrayToDescriptor("[1,2,3]"), null, "wrong length (via JSON string) must be rejected");
  assert.strictEqual(arrayToDescriptor({ not: "an array" }), null);

  console.log("PASS: descriptorToArray/arrayToDescriptor round-trip and validation");

  // ── buildMatcher / matchDescriptor against fixed fixtures ─────────────
  // Two distinct "members", each with a fixed 128-d descriptor far apart in
  // descriptor space, so Euclidean distance unambiguously separates them.
  const memberADescriptor = Float32Array.from({ length: 128 }, () => 0.1);
  const memberBDescriptor = Float32Array.from({ length: 128 }, () => 0.9);

  const labeled = [
    { label: "member-a", descriptors: [memberADescriptor] },
    { label: "member-b", descriptors: [memberBDescriptor] },
  ];

  const matcher = await buildMatcher(labeled, MATCH_THRESHOLD);
  assert(matcher, "buildMatcher must return a matcher for non-empty labeled input");

  // A live descriptor identical to member A's must match member A.
  const queryNearA = Float32Array.from(memberADescriptor);
  const matchA = matchDescriptor(matcher, queryNearA);
  assert.strictEqual(matchA.label, "member-a");
  assert.strictEqual(matchA.matched, true);
  assert.ok(matchA.distance < MATCH_THRESHOLD, "an exact-match descriptor must be within threshold");

  // A live descriptor identical to member B's must match member B, not A.
  const queryNearB = Float32Array.from(memberBDescriptor);
  const matchB = matchDescriptor(matcher, queryNearB);
  assert.strictEqual(matchB.label, "member-b");
  assert.strictEqual(matchB.matched, true);

  // A descriptor far from both (beyond the threshold) must report "unknown"/unmatched.
  const queryFar = Float32Array.from({ length: 128 }, (_, i) => (i % 2 === 0 ? 5 : -5));
  const matchFar = matchDescriptor(matcher, queryFar);
  assert.strictEqual(matchFar.matched, false);
  assert.strictEqual(matchFar.label, "unknown");

  console.log("PASS: buildMatcher/matchDescriptor distinguish known descriptors and reject unknown ones");

  // ── buildMatcher edge cases ────────────────────────────────────────────
  // Empty/entirely-unusable labeled input must return null, not throw or
  // build a matcher with zero entries (Defect 2's "no usable member face
  // photos found" UI path relies on this).
  assert.strictEqual(await buildMatcher([]), null);
  assert.strictEqual(await buildMatcher([{ label: "x", descriptors: [] }]), null);

  // matchDescriptor must be null-safe (no matcher yet, or no live descriptor
  // extracted) rather than throwing — both are common real states (Face Scan
  // not yet prepared, or no face detected in frame).
  assert.strictEqual(matchDescriptor(null, queryNearA), null);
  assert.strictEqual(matchDescriptor(matcher, null), null);

  console.log("PASS: buildMatcher/matchDescriptor edge cases (empty input, null-safety)");

  console.log("ALL PASS: faceRecognition.js descriptor + matcher unit coverage");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
