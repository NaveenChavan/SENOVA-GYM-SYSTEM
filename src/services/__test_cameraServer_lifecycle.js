const assert = require("assert");
const cameraServer = require("./cameraServer");

async function run() {
  const single = cameraServer.getLanIp({
    Ethernet: [
      { family: "IPv4", internal: false, address: "192.168.1.20" },
      { family: "IPv6", internal: false, address: "fe80::1" },
    ],
    Loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
  });
  assert.deepStrictEqual(single, { ip: "192.168.1.20" });

  const multiple = cameraServer.getLanIp({
    Ethernet: [{ family: 4, internal: false, address: "192.168.1.20" }],
    VPN: [{ family: "IPv4", internal: false, address: "10.0.0.8" }],
  });
  assert.deepStrictEqual(multiple, { candidates: ["192.168.1.20", "10.0.0.8"] });

  const first = await cameraServer.startSession({ ttlMs: 1000 });
  const second = await cameraServer.startSession({ ttlMs: 1000 });
  assert.notStrictEqual(first.sessionId, second.sessionId);
  assert.notStrictEqual(first.token, second.token);
  assert(first.url.includes(first.sessionId));
  assert.strictEqual(first.expiresAt > Date.now(), true);

  await cameraServer.stopSession(first.sessionId);
  assert.strictEqual(cameraServer.getSession(first.sessionId), undefined);

  let expiredId = null;
  cameraServer.events.once("session-expired", ({ sessionId }) => {
    expiredId = sessionId;
  });
  const expiring = await cameraServer.startSession({ ttlMs: 60 });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.strictEqual(expiredId, expiring.sessionId);
  assert.strictEqual(cameraServer.getSession(expiring.sessionId), undefined);

  const consumed = await cameraServer.startSession({ ttlMs: 60 });
  let consumedExpired = false;
  const expiryListener = ({ sessionId }) => {
    if (sessionId === consumed.sessionId) consumedExpired = true;
  };
  cameraServer.events.on("session-expired", expiryListener);
  cameraServer.markConsumed(consumed.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 120));
  cameraServer.events.removeListener("session-expired", expiryListener);
  assert.strictEqual(consumedExpired, false);
  assert.strictEqual(cameraServer.getSession(consumed.sessionId), undefined);

  await cameraServer.stopAllSessions();
  assert.strictEqual(cameraServer.getBoundPort(), null);
  console.log("PASS: camera session lifecycle, real expiry, cleanup, and LAN detection");
}

run().catch(async (error) => {
  console.error(error);
  await cameraServer.stopAllSessions();
  process.exitCode = 1;
});
