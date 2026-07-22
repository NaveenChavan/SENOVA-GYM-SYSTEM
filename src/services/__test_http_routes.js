const assert = require("assert");
const http = require("http");
const cameraServer = require("./cameraServer");

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined
      ? null
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port: cameraServer.getBoundPort(),
      path,
      method,
      headers: payload === null ? {} : {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* HTML route */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload !== null) req.end(payload);
    else req.end();
  });
}

async function run() {
  const session = await cameraServer.startSession({ ttlMs: 5000 });

  const page = await request("GET", `/capture/${session.sessionId}`);
  assert.strictEqual(page.status, 200);
  assert(page.text.includes('capture="environment"'));
  assert(page.text.includes(session.token));

  assert.strictEqual((await request("GET", "/capture/00000000-0000-0000-0000-000000000000")).status, 404);
  assert.strictEqual((await request("POST", `/upload/${session.sessionId}`, {
    photo: "data:image/jpeg;base64,AAAA",
  })).status, 400);
  assert.strictEqual((await request("POST", `/upload/${session.sessionId}`, {
    token: "wrong",
    photo: "data:image/jpeg;base64,AAAA",
  })).status, 401);
  assert.strictEqual((await request("POST", `/upload/${session.sessionId}`, {
    token: session.token,
    photo: "not-an-image",
  })).status, 400);
  assert.strictEqual((await request("POST", `/upload/${session.sessionId}`, "{" )).status, 400);

  let received = null;
  cameraServer.events.once("photo-received", (payload) => { received = payload; });
  const validPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==";
  const accepted = await request("POST", `/upload/${session.sessionId}`, {
    token: session.token,
    photo: validPhoto,
  });
  assert.strictEqual(accepted.status, 200);
  assert.strictEqual(received.sessionId, session.sessionId);
  assert.strictEqual(received.photo, validPhoto);

  assert.strictEqual((await request("POST", `/upload/${session.sessionId}`, {
    token: session.token,
    photo: validPhoto,
  })).status, 410);
  assert.strictEqual((await request("GET", `/capture/${session.sessionId}`)).status, 410);

  const largeSession = await cameraServer.startSession({ ttlMs: 5000 });
  const oversized = JSON.stringify({
    token: largeSession.token,
    photo: "data:image/jpeg;base64," + "A".repeat(cameraServer.MAX_UPLOAD_BYTES),
  });
  assert.strictEqual((await request("POST", `/upload/${largeSession.sessionId}`, oversized)).status, 413);

  await cameraServer.stopAllSessions();
  assert.strictEqual(cameraServer.getBoundPort(), null);
  console.log("PASS: camera HTTP GET/upload security, single-use, size cap, and cleanup");
}

run().catch(async (error) => {
  console.error(error);
  await cameraServer.stopAllSessions();
  process.exitCode = 1;
});
