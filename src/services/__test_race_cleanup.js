const assert = require("assert");
const net = require("net");
const cameraServer = require("./cameraServer");

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(300, () => { socket.destroy(); resolve(false); });
  });
}

async function run() {
  // Prime a session, then stop it to trigger a close, and immediately fire
  // two concurrent starts while the close may still be settling.
  const first = await cameraServer.startSession({ ttlMs: 2000 });
  const stopPromise = cameraServer.stopSession(first.sessionId);
  const [a, b] = await Promise.all([
    cameraServer.startSession({ ttlMs: 2000 }),
    cameraServer.startSession({ ttlMs: 2000 }),
  ]);
  await stopPromise;

  // Both concurrent starts must share a single listener/port.
  const portA = new URL(a.url).port;
  const portB = new URL(b.url).port;
  assert.strictEqual(portA, portB, `expected shared port, got ${portA} and ${portB}`);
  assert.strictEqual(String(cameraServer.getBoundPort()), portA);

  await cameraServer.stopAllSessions();
  assert.strictEqual(cameraServer.getBoundPort(), null);

  // After cleanup, neither the base port nor the fallback may stay open.
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(await portOpen(47521), false, "47521 still open after cleanup");
  assert.strictEqual(await portOpen(47522), false, "47522 still open after cleanup");

  console.log("PASS: concurrent close/start shares one listener; cleanup leaves no open port");
}

run().catch(async (error) => {
  console.error(error);
  await cameraServer.stopAllSessions();
  process.exitCode = 1;
});
