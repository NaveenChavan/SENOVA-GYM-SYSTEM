const crypto = require("crypto");
const http = require("http");
const os = require("os");
const { EventEmitter } = require("events");

const SESSION_TTL_MS = 180 * 1000;
const BASE_PORT = 47521;
const MAX_PORT_ATTEMPTS = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const sessions = new Map();
const events = new EventEmitter();

let httpServer = null;
let boundPort = null;
let startPromise = null;
let closePromise = null;

function getLanIp(interfacesOverride) {
  const interfaces = interfacesOverride || os.networkInterfaces();
  const addresses = new Set();

  Object.values(interfaces).forEach((entries = []) => {
    entries.forEach((entry) => {
      const isIpv4 = entry.family === "IPv4" || entry.family === 4;
      if (isIpv4 && !entry.internal && entry.address) addresses.add(entry.address);
    });
  });

  const candidates = [...addresses];
  return candidates.length === 1 ? { ip: candidates[0] } : { candidates };
}

function resolveLanAddress(selectedIp) {
  const result = getLanIp();
  const candidates = result.ip ? [result.ip] : result.candidates;

  if (!candidates.length) {
    throw new Error("No LAN IPv4 address was found. Connect this computer to the same network as the phone.");
  }
  if (selectedIp && !candidates.includes(selectedIp)) {
    throw new Error("The selected LAN address is no longer available.");
  }

  return {
    ip: selectedIp || result.ip || candidates[0],
    candidates: candidates.length > 1 ? candidates : [],
  };
}

function clearSessionTimer(session) {
  if (session?.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function markConsumed(sessionId) {
  const session = sessions.get(sessionId);
  if (session) session.consumed = true;
}

async function startSession(options = {}) {
  const { ip, ttlMs = SESSION_TTL_MS } = options;
  const network = resolveLanAddress(ip);
  const port = await ensureServerStarted();
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ttlMs;

  const session = {
    token,
    expiresAt,
    consumed: false,
    timer: null,
  };

  session.timer = setTimeout(() => {
    const current = sessions.get(sessionId);
    if (!current) return;
    sessions.delete(sessionId);
    if (!current.consumed) events.emit("session-expired", { sessionId });
    void stopServerIfIdle();
  }, ttlMs);
  session.timer.unref?.();

  sessions.set(sessionId, session);

  return {
    sessionId,
    token,
    url: `http://${network.ip}:${port}/capture/${sessionId}`,
    expiresAt,
    ip: network.ip,
    candidates: network.candidates,
  };
}

async function stopSession(sessionId) {
  const session = sessions.get(sessionId);
  clearSessionTimer(session);
  sessions.delete(sessionId);
  await stopServerIfIdle();
}

async function stopAllSessions() {
  sessions.forEach(clearSessionTimer);
  sessions.clear();
  await stopServerIfIdle(true);
}

function renderCapturePage(sessionId, token) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SENOVA Member Photo</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px 16px;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;justify-content:center}.card{width:min(100%,420px)}h1{font-size:22px;margin:0 0 6px}.hint{color:#94a3b8;margin:0 0 22px}.picker{display:block;width:100%;padding:14px;background:#1e293b;border:1px solid #334155;border-radius:12px;color:#fff}img{display:none;width:100%;max-height:55vh;object-fit:contain;margin:18px 0;border-radius:14px;background:#020617}button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;background:#2563eb;color:#fff;font-weight:800;font-size:16px}button:disabled{background:#475569}.status{min-height:24px;margin-top:14px;text-align:center;color:#94a3b8}.error{color:#f87171}.success{color:#4ade80}
  </style>
</head>
<body><main class="card">
  <h1>SENOVA Gym</h1><p class="hint">Take or select the member photo, then upload it to the registration desk.</p>
  <input class="picker" id="photo" type="file" accept="image/*" capture="environment">
  <img id="preview" alt="Selected member photo">
  <button id="upload" type="button" disabled>Upload Photo</button>
  <p id="status" class="status"></p>
</main>
<script>
  const sessionId=${JSON.stringify(sessionId)};
  const token=${JSON.stringify(token)};
  const input=document.getElementById("photo");
  const preview=document.getElementById("preview");
  const upload=document.getElementById("upload");
  const status=document.getElementById("status");
  let dataUrl="";

  input.addEventListener("change",()=>{
    const file=input.files&&input.files[0];
    if(!file)return;
    if(!file.type.startsWith("image/")){status.textContent="Please choose an image file.";status.className="status error";return}
    const reader=new FileReader();
    reader.onload=()=>{dataUrl=String(reader.result||"");preview.src=dataUrl;preview.style.display="block";upload.disabled=false;status.textContent="";status.className="status"};
    reader.onerror=()=>{status.textContent="Could not read this photo.";status.className="status error"};
    reader.readAsDataURL(file);
  });

  upload.addEventListener("click",async()=>{
    if(!dataUrl)return;
    upload.disabled=true;status.textContent="Uploading…";status.className="status";
    try{
      const response=await fetch("/upload/"+sessionId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,photo:dataUrl})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||("Upload failed ("+response.status+")"));
      status.textContent="Photo received. You may close this page.";status.className="status success";input.disabled=true;
    }catch(error){status.textContent=error.message||"Upload failed.";status.className="status error";upload.disabled=false}
  });
</script></body></html>`;
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
  });
  res.end(json);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'",
  });
  res.end(html);
}

function validateSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { status: 404, error: "Unknown capture session." };
  if (Date.now() >= session.expiresAt) return { status: 410, error: "This capture session has expired." };
  if (session.consumed) return { status: 410, error: "This capture session has already been used." };
  return { session };
}

function handleGetCapture(res, sessionId) {
  const result = validateSession(sessionId);
  if (!result.session) {
    return sendHtml(res, result.status, `<h1>Capture unavailable</h1><p>${result.error} Ask staff to generate a new QR code.</p>`);
  }
  return sendHtml(res, 200, renderCapturePage(sessionId, result.session.token));
}

function validateImageDataUrl(photo) {
  const match = photo.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,([a-z0-9+/]+={0,2})$/i);
  if (!match) return false;

  const [, type, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) return false;
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (canonical !== encoded.replace(/=+$/, "")) return false;

  const normalizedType = type.toLowerCase();
  if (normalizedType === "jpeg" || normalizedType === "jpg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (normalizedType === "png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (normalizedType === "webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
}

function handleUpload(req, res, sessionId) {
  const initial = validateSession(sessionId);
  if (!initial.session) return sendJson(res, initial.status, { error: initial.error });

  const chunks = [];
  let bytes = 0;
  let rejected = false;

  req.on("data", (chunk) => {
    if (rejected) return;
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES) {
      rejected = true;
      chunks.length = 0;
      sendJson(res, 413, { error: "Photo is too large. The maximum upload size is 10MB." });
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (rejected) return;

    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return sendJson(res, 400, { error: "Malformed JSON request." });
    }

    if (typeof body?.token !== "string" || typeof body?.photo !== "string") {
      return sendJson(res, 400, { error: "Both token and photo are required." });
    }

    const supplied = Buffer.from(body.token);
    const expected = Buffer.from(initial.session.token);
    const validToken = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!validToken) return sendJson(res, 401, { error: "Invalid capture token." });

    if (!validateImageDataUrl(body.photo)) {
      return sendJson(res, 400, { error: "Photo must be a valid JPEG, PNG, WebP, or GIF base64 data URL." });
    }

    const current = validateSession(sessionId);
    if (!current.session) return sendJson(res, current.status, { error: current.error });

    markConsumed(sessionId);
    events.emit("photo-received", { sessionId, photo: body.photo });
    return sendJson(res, 200, { success: true });
  });

  req.on("error", () => {
    rejected = true;
  });
}

function requestListener(req, res) {
  let pathname;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return sendJson(res, 400, { error: "Invalid URL." });
  }

  const match = pathname.match(/^\/(capture|upload)\/([a-f0-9-]+)$/i);
  if (!match) return sendJson(res, 404, { error: "Not found." });

  const [, route, sessionId] = match;
  if (route === "capture" && req.method === "GET") return handleGetCapture(res, sessionId);
  if (route === "upload" && req.method === "POST") return handleUpload(req, res, sessionId);
  res.setHeader("Allow", route === "capture" ? "GET" : "POST");
  return sendJson(res, 405, { error: "Method not allowed." });
}

async function ensureServerStarted() {
  if (httpServer?.listening && boundPort) return boundPort;
  if (startPromise) return startPromise;
  if (closePromise) {
    await closePromise;
    return ensureServerStarted();
  }

  startPromise = new Promise((resolve, reject) => {
    let port = BASE_PORT;
    let attempts = 0;

    const listen = () => {
      const server = http.createServer(requestListener);
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" && attempts < MAX_PORT_ATTEMPTS) {
          attempts += 1;
          port += 1;
          listen();
          return;
        }
        startPromise = null;
        reject(error);
      });
      server.listen(port, "0.0.0.0", () => {
        server.removeAllListeners("error");
        server.on("error", (error) => events.emit("server-error", error));
        httpServer = server;
        boundPort = port;
        startPromise = null;
        resolve(port);
      });
    };

    listen();
  });

  return startPromise;
}

async function stopServerIfIdle(force = false) {
  if ((!force && sessions.size > 0) || !httpServer) return;
  if (closePromise) return closePromise;

  const server = httpServer;
  httpServer = null;
  boundPort = null;
  server.closeAllConnections?.();
  closePromise = new Promise((resolve) => {
    server.close(() => {
      closePromise = null;
      resolve();
    });
  });
  return closePromise;
}

module.exports = {
  events,
  startSession,
  stopSession,
  stopAllSessions,
  getLanIp,
  getSession,
  markConsumed,
  getBoundPort: () => boundPort,
  SESSION_TTL_MS,
  MAX_UPLOAD_BYTES,
};
