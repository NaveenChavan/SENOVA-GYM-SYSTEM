// Minimal in-memory mock of the two @vladmandic/face-api exports that
// faceRecognition.js's buildMatcher()/matchDescriptor() touch directly:
// LabeledFaceDescriptors and FaceMatcher. Reproduces their documented
// nearest-neighbour Euclidean-distance behavior exactly (see face-api's
// FaceMatcher.findBestMatch: for each labeled descriptor set, take the
// mean descriptor distance to the query, then pick the label with the
// smallest mean distance; label the result "unknown" if that smallest
// distance exceeds the matcher's distanceThreshold).
//
// Used only by __test_faceRecognition.mjs via a Node loader hook, so the
// real TensorFlow.js-backed face-api package (which needs the
// @tensorflow/tfjs-node native binding to run outside a browser) is never
// required in this test.

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export class LabeledFaceDescriptors {
  constructor(label, descriptors) {
    this.label = label;
    this.descriptors = descriptors;
  }
}

export class FaceMatcher {
  constructor(inputs, distanceThreshold = 0.6) {
    const list = Array.isArray(inputs) ? inputs : [inputs];
    this._distanceThreshold = distanceThreshold;
    this._labeledDescriptors = list.map((entry) =>
      entry instanceof LabeledFaceDescriptors
        ? entry
        : new LabeledFaceDescriptors("unknown", [entry]),
    );
  }

  get distanceThreshold() {
    return this._distanceThreshold;
  }

  findBestMatch(queryDescriptor) {
    let bestLabel = "unknown";
    let bestDistance = Infinity;
    for (const entry of this._labeledDescriptors) {
      const distances = entry.descriptors.map((d) => euclideanDistance(d, queryDescriptor));
      const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
      if (meanDistance < bestDistance) {
        bestDistance = meanDistance;
        bestLabel = entry.label;
      }
    }
    const label = bestDistance <= this._distanceThreshold ? bestLabel : "unknown";
    return {
      label,
      distance: bestDistance,
      toString: () => `${label} (${bestDistance.toFixed(2)})`,
    };
  }
}

// faceRecognition.js also touches faceapi.nets.*, faceapi.tf, faceapi.env,
// faceapi.TinyFaceDetectorOptions, faceapi.detectSingleFace/detectAllFaces at
// module scope or inside functions the unit tests under test never call
// (loadModels/computeDescriptor/detectAllFaceBoxes/warmup all require a real
// browser + TF.js runtime and are explicitly out of scope for this mock —
// only descriptorToArray/arrayToDescriptor/buildMatcher/matchDescriptor are
// covered). Stub the rest minimally so importing faceRecognition.js doesn't
// throw on unrelated property access.
export const nets = {
  tinyFaceDetector: { isLoaded: false, loadFromUri: async () => {} },
  faceLandmark68Net: { isLoaded: false, loadFromUri: async () => {} },
  faceRecognitionNet: { isLoaded: false, loadFromUri: async () => {} },
};
export const tf = { setBackend: async () => true, ready: async () => {} };
export const env = { setEnv: () => {}, createBrowserEnv: () => ({}) };
export class TinyFaceDetectorOptions {
  constructor(options) {
    Object.assign(this, options);
  }
}
export const detectSingleFace = () => ({
  withFaceLandmarks: () => ({ withFaceDescriptor: async () => null }),
});
export const detectAllFaces = async () => [];
