const assert = require("assert");
const http = require("http");
const cameraServer = require("./cameraServer");

async function run() {
  const blocker = http.createServer((_req, res) => res.end("occupied"));
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(47521, "0.0.0.0", resolve);
  });

  try {
    const session = await cameraServer.startSession({ ttlMs: 1000 });
    assert.strictEqual(cameraServer.getBoundPort(), 47522);
    assert(session.url.includes(":47522/capture/"));
    await cameraServer.stopSession(session.sessionId);
    assert.strictEqual(cameraServer.getBoundPort(), null);
    console.log("PASS: EADDRINUSE fallback selected port 47522 and cleanup closed it");
  } finally {
    await cameraServer.stopAllSessions();
    await new Promise((resolve) => blocker.close(resolve));
  }
}

run().catch(async (error) => {
  console.error(error);
  await cameraServer.stopAllSessions();
  process.exitCode = 1;
});
