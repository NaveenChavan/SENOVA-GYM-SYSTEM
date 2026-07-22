const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Client, LocalAuth } = require("whatsapp-web.js");
const cameraServer = require("./src/services/cameraServer");

let whatsappClient,
  mainWindow,
  latestQrToken = null,
  whatsappStatus = "INITIALIZING";

// DATABASE INITIALIZATION
const db = new sqlite3.Database(
  path.join(app.getPath("userData"), "gym.db"),
  (err) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log("Connected to the local SQLite database.");
  },
);

// STRICT SYNCHRONOUS SCHEMA COMPLIANCE
db.serialize(() => {
  // Members Table Creation
  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
      age INTEGER, sex TEXT, plan TEXT, paymentMode TEXT, amountPaid REAL,
      amountPending REAL, joinDate TEXT, expiryDate TEXT, status TEXT DEFAULT 'Active',
      assignedTrainerId TEXT DEFAULT 'None', photo TEXT DEFAULT NULL
    )
  `);

  // Safe Column Injections for backward compatibility without breaking execution
  db.run(
    `ALTER TABLE members ADD COLUMN assignedTrainerId TEXT DEFAULT 'None'`,
    () => {},
  );
  db.run(`ALTER TABLE members ADD COLUMN photo TEXT DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE members ADD COLUMN joinTime TEXT DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE members ADD COLUMN notes TEXT DEFAULT NULL`, () => {});
  db.run(`ALTER TABLE members ADD COLUMN faceDescriptor TEXT DEFAULT NULL`, () => {});

  // Meta & Settings Tables
  db.run(
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS trainers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, specialization TEXT, phone TEXT, assignedClients INTEGER DEFAULT 0)`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS auth_session (id TEXT PRIMARY KEY, user_email TEXT, gym_registered INTEGER DEFAULT 0, subscription_status TEXT DEFAULT 'NONE')`,
  );

  // Attendance Table
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memberId INTEGER NOT NULL,
      memberName TEXT NOT NULL,
      phone TEXT NOT NULL,
      checkInTime TEXT NOT NULL,
      date TEXT NOT NULL
    )
  `);
});

// 🚀 LIVE BROADCAST AGGREGATORS (Ensures frontend auto-syncs without manual reload)
function broadcastTrainersAndMembers(targetEvent = null) {
  db.all(`SELECT * FROM trainers ORDER BY id DESC`, [], (err, trainers) => {
    if (err) return;
    db.all(
      `SELECT id, name, phone, assignedTrainerId FROM members WHERE status = 'Active'`,
      [],
      (memErr, members) => {
        const integrated = trainers.map((t) => {
          const clients = (members || [])
            .filter((m) => String(m.assignedTrainerId) === String(t.id))
            .map((m) => ({ name: m.name, phone: m.phone }));
          return { ...t, clients, assignedClients: clients.length };
        });
        if (targetEvent)
          targetEvent.reply("get-trainers-response", {
            success: true,
            data: integrated,
          });
        else if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("get-trainers-response", {
            success: true,
            data: integrated,
          });
      },
    );
  });
}

function broadcastMembersList(targetEvent = null) {
  db.all(`SELECT * FROM members ORDER BY id DESC`, [], (err, rows) => {
    if (err) return;
    if (targetEvent)
      targetEvent.reply("get-members-response", { success: true, data: rows });
    else if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("get-members-response", {
        success: true,
        data: rows,
      });
  });
}

// 📱 WHATSAPP BACKGROUND ENGINE ─ Robust Startup Manager
const fs = require("fs");
const dns = require("dns");

const WA_MAX_RETRIES = 5;
const WA_WATCHDOG_MS = 60000;
const WA_BACKOFF_BASE = 5000; // exponential: 5s, 10s, 20s, 40s, 80s

let waWatchdog = null;

function broadcastWhatsAppStatus() {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("whatsapp-status-update", whatsappStatus);
}

/**
 * Remove all stale Chromium/LevelDB lock files that prevent clean startup.
 */
function cleanStaleLocks() {
  const sessionPath = path.join(__dirname, ".wwebjs_auth", "session");
  // Top-level Chromium locks
  const topLocks = ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "DevToolsActivePort"];
  topLocks.forEach((name) => {
    try { fs.unlinkSync(path.join(sessionPath, name)); } catch { /* lock file absent — nothing to clean */ }
  });
  // LevelDB LOCK files inside Default/ (recursive)
  const defaultPath = path.join(sessionPath, "Default");
  try {
    removeLockFilesRecursive(defaultPath);
  } catch { /* Default/ may not exist yet on first run */ }
}

function removeLockFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeLockFilesRecursive(fullPath);
    } else if (entry.name === "LOCK") {
      try { fs.unlinkSync(fullPath); } catch { /* file may be held or already gone */ }
    }
  }
}

/**
 * Check internet connectivity by resolving web.whatsapp.com DNS.
 * Retries up to 10 times with 3s gaps before giving up.
 */
function waitForConnectivity() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 10;
    const check = () => {
      dns.resolve("web.whatsapp.com", (err) => {
        if (!err) {
          console.log("[WhatsApp] Network connectivity confirmed.");
          return resolve(true);
        }
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn("[WhatsApp] Network check failed after 10 attempts. Proceeding anyway...");
          return resolve(false);
        }
        console.log(`[WhatsApp] Waiting for network... (attempt ${attempts}/${maxAttempts})`);
        setTimeout(check, 3000);
      });
    };
    check();
  });
}

/**
 * Core WhatsApp initializer with watchdog timer and full event registration.
 */
function initWhatsApp(retryCount = 0) {
  // Clear any previous watchdog
  if (waWatchdog) { clearTimeout(waWatchdog); waWatchdog = null; }

  // Destroy previous client if it exists
  if (whatsappClient) {
    whatsappClient.destroy().catch(() => {});
    whatsappClient = null;
  }

  cleanStaleLocks();

  const attemptLabel = `${retryCount + 1}/${WA_MAX_RETRIES + 1}`;
  console.log(`[WhatsApp] ── Initialization attempt ${attemptLabel} ──`);
  whatsappStatus = retryCount === 0 ? "INITIALIZING" : "RETRYING";
  broadcastWhatsAppStatus();

  whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    },
  });

  // ─── Full Event Registration ───────────────────────────────

  whatsappClient.on("loading_screen", (percent, message) => {
    console.log(`[WhatsApp] Loading: ${percent}% — ${message}`);
    whatsappStatus = "LOADING";
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("whatsapp-status-update", `LOADING:${percent}`);
  });

  whatsappClient.on("authenticated", () => {
    console.log("[WhatsApp] Session authenticated successfully.");
    whatsappStatus = "AUTHENTICATED";
    broadcastWhatsAppStatus();
  });

  whatsappClient.on("qr", (qr) => {
    console.log("[WhatsApp] QR code received.");
    // QR means waiting for scan — cancel watchdog (user action needed)
    if (waWatchdog) { clearTimeout(waWatchdog); waWatchdog = null; }
    latestQrToken = qr;
    whatsappStatus = "QR_READY";
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("whatsapp-qr", qr);
      mainWindow.webContents.send("whatsapp-status-update", "QR_READY");
    }
  });

  whatsappClient.on("ready", () => {
    console.log("[WhatsApp] ✓ Connected and ready.");
    if (waWatchdog) { clearTimeout(waWatchdog); waWatchdog = null; }
    latestQrToken = null;
    whatsappStatus = "CONNECTED";
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("whatsapp-status-update", "CONNECTED");
  });

  whatsappClient.on("change_state", (state) => {
    console.log(`[WhatsApp] State changed: ${state}`);
  });

  whatsappClient.on("disconnected", (reason) => {
    console.log(`[WhatsApp] Disconnected: ${reason}`);
    if (waWatchdog) { clearTimeout(waWatchdog); waWatchdog = null; }
    whatsappStatus = "DISCONNECTED";
    latestQrToken = null;
    whatsappClient = null;
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("whatsapp-status-update", "DISCONNECTED");
  });

  whatsappClient.on("auth_failure", (msg) => {
    console.error("[WhatsApp] Authentication failure:", msg);
    if (waWatchdog) { clearTimeout(waWatchdog); waWatchdog = null; }
    whatsappStatus = "AUTH_FAILURE";
    broadcastWhatsAppStatus();
  });

  // ─── Start watchdog BEFORE calling initialize ─────────────
  waWatchdog = setTimeout(() => {
    console.error(`[WhatsApp] ✗ Watchdog timeout (${WA_WATCHDOG_MS / 1000}s) — no READY event received.`);
    waWatchdog = null;

    // Force-kill the hung client
    if (whatsappClient) {
      whatsappClient.destroy().catch(() => {});
      whatsappClient = null;
    }

    // Retry with backoff
    if (retryCount < WA_MAX_RETRIES) {
      const delay = WA_BACKOFF_BASE * Math.pow(2, retryCount); // 5s, 10s, 20s, 40s, 80s
      console.log(`[WhatsApp] Retrying in ${delay / 1000}s... (attempt ${retryCount + 2}/${WA_MAX_RETRIES + 1})`);
      whatsappStatus = "RETRYING";
      broadcastWhatsAppStatus();
      setTimeout(() => initWhatsApp(retryCount + 1), delay);
    } else {
      console.error("[WhatsApp] ✗ All retry attempts exhausted. Status: FAILED.");
      whatsappStatus = "FAILED";
      broadcastWhatsAppStatus();
    }
  }, WA_WATCHDOG_MS);

  // ─── Launch initialize (catch handles immediate throw errors) ──
  whatsappClient.initialize().catch((err) => {
    console.error(`[WhatsApp] Initialize threw (attempt ${attemptLabel}):`, err?.message || err);
    if (waWatchdog) { clearTimeout(waWatchdog); waWatchdog = null; }
    whatsappClient = null;

    if (retryCount < WA_MAX_RETRIES) {
      const delay = WA_BACKOFF_BASE * Math.pow(2, retryCount);
      console.log(`[WhatsApp] Retrying in ${delay / 1000}s...`);
      whatsappStatus = "RETRYING";
      broadcastWhatsAppStatus();
      setTimeout(() => initWhatsApp(retryCount + 1), delay);
    } else {
      console.error("[WhatsApp] ✗ All retry attempts exhausted. Status: FAILED.");
      whatsappStatus = "FAILED";
      broadcastWhatsAppStatus();
    }
  });
}

// ─── Application Window & Startup Sequence ─────────────────────

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1020,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  // In development the renderer is served by the Vite dev server; a packaged
  // build has no dev server, so load the bundled files from dist/ instead.
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }

  mainWindow.webContents.on("did-finish-load", async () => {
    console.log("[Startup] BrowserWindow fully loaded.");
    console.log("[Startup] Checking network connectivity...");
    await waitForConnectivity();
    console.log("[Startup] Starting WhatsApp engine...");
    initWhatsApp();
  });
});

// ========================================================
// CORE DISPATCH PIPELINES (IPC CHANNELS)
// ========================================================

ipcMain.on("request-whatsapp-status", (event) => {
  event.reply("whatsapp-status-update", whatsappStatus);
  if (latestQrToken) event.reply("whatsapp-qr", latestQrToken);
});

ipcMain.on("get-members", (event) => broadcastMembersList(event));
ipcMain.on("get-trainers", (event) => broadcastTrainersAndMembers(event));

// MOBILE CAMERA CAPTURE
ipcMain.handle("start-camera-session", async (_event, options = {}) => {
  try {
    const session = await cameraServer.startSession({
      ip: typeof options.ip === "string" ? options.ip : undefined,
    });
    return { success: true, ...session };
  } catch (error) {
    return { success: false, error: error.message || "Could not start the camera capture server." };
  }
});

ipcMain.handle("stop-camera-session", async (_event, sessionId) => {
  try {
    if (typeof sessionId === "string") await cameraServer.stopSession(sessionId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || "Could not stop the camera session." };
  }
});

cameraServer.events.on("photo-received", (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("photo-received", payload);
  }
});

cameraServer.events.on("session-expired", (payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("camera-session-expired", payload);
  }
});

cameraServer.events.on("server-error", (error) => {
  console.error("[CameraServer] HTTP server error:", error);
});

// FACE RECOGNITION — persist a member's computed face descriptor (128-d JSON).
// Used to backfill/cache descriptors so attendance face-matching does not have
// to recompute from the stored photo on every scan. Does not touch photo/save.
ipcMain.on("save-face-descriptor", (event, payload) => {
  const { id, descriptor } = payload || {};
  if (!id || !Array.isArray(descriptor) || descriptor.length !== 128) {
    return event.reply("save-face-descriptor-response", { success: false, error: "Invalid descriptor payload." });
  }
  db.run(
    `UPDATE members SET faceDescriptor = ? WHERE id = ?`,
    [JSON.stringify(descriptor), id],
    function (err) {
      if (err) {
        event.reply("save-face-descriptor-response", { success: false, error: err.message });
      } else {
        event.reply("save-face-descriptor-response", { success: true, id });
      }
    },
  );
});

// CREATE MEMBER (Includes Photo injection)
ipcMain.on("add-member", (event, memberData) => {
  const {
    name,
    phone,
    age,
    sex,
    plan,
    paymentMode,
    amountPaid,
    amountPending,
    joinDate,
    joinTime,
    expiryDate,
    assignedTrainerId,
    photo,
    faceDescriptor,
  } = memberData;

  // Prevent duplicate mobile numbers before database insert
  db.get(`SELECT id FROM members WHERE phone = ?`, [phone], (checkErr, existing) => {
    if (checkErr) {
      return event.reply("add-member-response", { success: false, error: checkErr.message });
    }
    if (existing) {
      return event.reply("add-member-response", { success: false, error: "A member with this mobile number already exists." });
    }

    // faceDescriptor arrives pre-computed by the renderer at photo-save time
    // (computeDescriptorFromDataUrl in MembersPage) — a 128-length number[] or
    // null when no face was detectable in the registered photo. Stored as
    // JSON text, same shape as the "save-face-descriptor" backfill path.
    const descriptorJson =
      Array.isArray(faceDescriptor) && faceDescriptor.length === 128
        ? JSON.stringify(faceDescriptor)
        : null;

    const query = `INSERT INTO members (name, phone, age, sex, plan, paymentMode, amountPaid, amountPending, joinDate, joinTime, expiryDate, assignedTrainerId, photo, faceDescriptor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      query,
      [
        name,
        phone,
        age,
        sex,
        plan,
        paymentMode,
        amountPaid,
        amountPending,
        joinDate,
        joinTime || null,
        expiryDate,
        assignedTrainerId || "None",
        photo || null,
        descriptorJson,
      ],
      function (err) {
        if (err) {
          event.reply("add-member-response", { success: false, error: err.message });
        } else {
          event.reply("add-member-response", { success: true, id: this.lastID });
          broadcastMembersList();
          broadcastTrainersAndMembers();
        }
      },
    );
  });
});

// UPDATE MEMBER
ipcMain.on("update-member", (event, payload) => {
  const {
    id,
    name,
    phone,
    age,
    sex,
    plan,
    paymentMode,
    amountPaid,
    amountPending,
    status,
    assignedTrainerId,
    joinDate,
    joinTime,
    photo,
    photoChanged,
    faceDescriptor,
  } = payload;

  // Prevent duplicate phone on edit (exclude current member)
  db.get(`SELECT id FROM members WHERE phone = ? AND id != ?`, [phone, id], (checkErr, existing) => {
    if (checkErr) {
      return event.reply("update-member-response", { success: false, error: checkErr.message });
    }
    if (existing) {
      return event.reply("update-member-response", { success: false, error: "Another member with this mobile number already exists." });
    }

    // Only touch photo/faceDescriptor columns when the caller explicitly
    // changed the photo (photoChanged: true) — most update-member calls (edit
    // details, freeze/unfreeze) don't include a photo at all and must leave
    // the existing photo/descriptor untouched.
    //
    // When the photo DID change: store the new photo, and either the
    // pre-computed descriptor (faceDescriptor, computed by the renderer at
    // save time — a 128-length number[] or null when no face was detected)
    // or NULL if none was supplied, so a stale descriptor from the OLD photo
    // never lingers against the new one (Hardening 6: descriptor invalidation
    // on photo change).
    const touchesPhoto = photoChanged === true;
    const descriptorJson =
      touchesPhoto && Array.isArray(faceDescriptor) && faceDescriptor.length === 128
        ? JSON.stringify(faceDescriptor)
        : null;

    const query = touchesPhoto
      ? `UPDATE members SET name=?, phone=?, age=?, sex=?, plan=?, paymentMode=?, amountPaid=?, amountPending=?, status=?, assignedTrainerId=?, joinDate=COALESCE(?, joinDate), joinTime=COALESCE(?, joinTime), photo=?, faceDescriptor=? WHERE id=?`
      : `UPDATE members SET name=?, phone=?, age=?, sex=?, plan=?, paymentMode=?, amountPaid=?, amountPending=?, status=?, assignedTrainerId=?, joinDate=COALESCE(?, joinDate), joinTime=COALESCE(?, joinTime) WHERE id=?`;

    const params = [
      name,
      phone,
      age,
      sex,
      plan,
      paymentMode,
      Number(amountPaid),
      Number(amountPending),
      status,
      assignedTrainerId || "None",
      joinDate || null,
      joinTime || null,
    ];
    if (touchesPhoto) params.push(photo || null, descriptorJson);
    params.push(id);

    db.run(query, params, function (err) {
      if (err) {
        event.reply("update-member-response", { success: false, error: err.message });
      } else {
        event.reply("update-member-response", { success: true });
        broadcastMembersList();
        broadcastTrainersAndMembers();
      }
    });
  });
});

// RENEW MEMBER (Update plan, expiryDate, status, payment fields, joinDate on renewal)
ipcMain.on("renew-member", (event, payload) => {
  const { id, plan, paymentMode, amountPaid, amountPending, expiryDate, startDate, notes } = payload;

  if (!id || !plan || !expiryDate) {
    return event.reply("renew-member-response", { success: false, error: "Missing required renewal fields." });
  }

  const query = `UPDATE members SET plan=?, paymentMode=?, amountPaid=?, amountPending=?, expiryDate=?, joinDate=?, notes=?, status='Active' WHERE id=?`;
  db.run(
    query,
    [plan, paymentMode, Number(amountPaid), Number(amountPending), expiryDate, startDate || expiryDate, notes || null, id],
    function (err) {
      if (err) {
        event.reply("renew-member-response", { success: false, error: err.message });
      } else {
        event.reply("renew-member-response", { success: true });
        broadcastMembersList();
        broadcastTrainersAndMembers();
      }
    },
  );
});

// DELETE MEMBER
ipcMain.on("delete-member", (event, memberId) => {
  db.run(`DELETE FROM members WHERE id = ?`, [memberId], function (err) {
    if (err) {
      event.reply("delete-member-response", { success: false, error: err.message });
    } else {
      event.reply("delete-member-response", { success: true });
      broadcastMembersList();
      broadcastTrainersAndMembers();
    }
  });
});

// ADD TRAINER
ipcMain.on("add-trainer", (event, trainerData) => {
  const { name, specialization, phone } = trainerData;

  const allowedSpecializations = ["Bodybuilding", "Powerlifting", "Weightlifting", "General Fitness & Fat Loss"];
  if (!allowedSpecializations.includes(specialization)) {
    return event.reply("add-trainer-response", { success: false, error: "Invalid specialization selected." });
  }

  // Prevent duplicate trainer phone numbers
  db.get(`SELECT id FROM trainers WHERE phone = ?`, [phone], (checkErr, existing) => {
    if (checkErr) {
      return event.reply("add-trainer-response", { success: false, error: checkErr.message });
    }
    if (existing) {
      return event.reply("add-trainer-response", { success: false, error: "A trainer with this mobile number already exists." });
    }

    db.run(
      `INSERT INTO trainers (name, specialization, phone, assignedClients) VALUES (?, ?, ?, 0)`,
      [name, specialization, phone],
      function (err) {
        if (err) {
          event.reply("add-trainer-response", { success: false, error: err.message });
        } else {
          event.reply("add-trainer-response", { success: true });
          broadcastTrainersAndMembers();
        }
      },
    );
  });
});

// DELETE TRAINER (Auto-shifts clients to General Training)
ipcMain.on("delete-trainer", (event, trainerId) => {
  db.run(`DELETE FROM trainers WHERE id = ?`, [trainerId], function (err) {
    if (err) {
      event.reply("delete-trainer-response", { success: false, error: err.message });
    } else {
      db.run(
        `UPDATE members SET assignedTrainerId = 'None' WHERE assignedTrainerId = ?`,
        [String(trainerId)],
        () => {
          event.reply("delete-trainer-response", { success: true });
          broadcastMembersList();
          broadcastTrainersAndMembers();
        },
      );
    }
  });
});

// ATTENDANCE
ipcMain.on("mark-attendance", (event, payload) => {
  const { memberId, memberName, phone } = payload;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  db.get(`SELECT id FROM attendance WHERE memberId = ? AND date = ?`, [memberId, today], (checkErr, existing) => {
    if (checkErr) {
      return event.reply("mark-attendance-response", { success: false, error: checkErr.message });
    }
    if (existing) {
      return event.reply("mark-attendance-response", { success: false, duplicate: true });
    }

    const checkInTime = new Date().toISOString();
    db.run(
      `INSERT INTO attendance (memberId, memberName, phone, checkInTime, date) VALUES (?, ?, ?, ?, ?)`,
      [memberId, memberName, phone, checkInTime, today],
      function (err) {
        if (err) {
          event.reply("mark-attendance-response", { success: false, error: err.message });
        } else {
          event.reply("mark-attendance-response", { success: true });
        }
      },
    );
  });
});

ipcMain.on("get-today-attendance", (event) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  db.all(`SELECT * FROM attendance WHERE date = ? ORDER BY id DESC`, [today], (err, rows) => {
    if (err) {
      event.reply("get-today-attendance-response", { success: false, error: err.message });
    } else {
      event.reply("get-today-attendance-response", { success: true, data: rows });
    }
  });
});

ipcMain.on("get-attendance-history", (event, date) => {
  db.all(`SELECT * FROM attendance WHERE date = ? ORDER BY id DESC`, [date], (err, rows) => {
    if (err) {
      event.reply("get-attendance-history-response", { success: false, error: err.message });
    } else {
      event.reply("get-attendance-history-response", { success: true, data: rows });
    }
  });
});

// GYM SETTINGS
ipcMain.on("save-settings", (event, settingsData) => {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
  );
  let stmtError = null;
  Object.keys(settingsData).forEach((key) =>
    stmt.run(key, JSON.stringify(settingsData[key]), (err) => {
      if (err && !stmtError) stmtError = err;
    }),
  );
  stmt.finalize((finalizeErr) => {
    const err = stmtError || finalizeErr;
    if (err) event.reply("save-settings-response", { success: false, error: err.message });
    else event.reply("save-settings-response", { success: true });
  });
});

ipcMain.on("get-settings", (event) => {
  db.all(`SELECT * FROM settings`, [], (err, rows) => {
    if (err) {
      return event.reply("get-settings-response", { success: false, error: err.message });
    }
    const config = {};
    rows.forEach((row) => {
      // A malformed/corrupt value must not crash the whole settings load.
      try {
        config[row.key] = JSON.parse(row.value);
      } catch {
        config[row.key] = row.value;
      }
    });
    event.reply("get-settings-response", { success: true, data: config });
  });
});

// AUTHENTICATION & SESSIONS
ipcMain.on("auth-login-success", (event, userData) => {
  db.run(
    `INSERT OR REPLACE INTO auth_session (id, user_email, gym_registered, subscription_status) VALUES ('session_token', ?, 1, 'ANNUAL_PLAN')`,
    [userData.email],
    () => {
      event.reply("auth-check-response", { success: true });
    },
  );
});

ipcMain.on("activate-subscription", (event, planTier) => {
  db.run(
    `UPDATE auth_session SET subscription_status = ? WHERE id = 'session_token'`,
    [planTier],
    () => {
      event.reply("activate-subscription-response", { success: true });
    },
  );
});

// WHATSAPP MESSAGING DISPATCH
ipcMain.on("send-whatsapp-bill", (event, payload) => {
  const {
    phone,
    name,
    plan,
    amountPaid,
    amountPending,
    expiryDate,
    gymName,
    type,
  } = payload;
  const chatId = `${phone.startsWith("91") ? phone : `91${phone}`}@c.us`;

  let messageText =
    type === "reminder"
      ? `*Payment Reminder: ${gymName || "SENOVA GYM"}* ⚠️\n\nHello *${name}*,\nThis is a friendly reminder that a balance of *₹${amountPending}* is pending for your gym subscription.\n\n📊 *Plan:* ${plan}\n📅 *Expiry Date:* ${expiryDate}\n\nKindly clear your outstanding dues at the counter. Thank you! 🙏`
      : `*Welcome to ${gymName || "SENOVA GYM"}* 💪\n\nHello *${name}*,\nYour registration is successful!\n\n📋 *Plan:* ${plan}\n💰 *Amount Paid:* ₹${amountPaid}\n📅 *Valid Till:* ${expiryDate}\n\nThank you for choosing us! 🔥`;

  if (whatsappClient && whatsappStatus === "CONNECTED") {
    whatsappClient
      .sendMessage(chatId, messageText)
      .catch((e) => console.error(e));
  }
});

// ========================================================
// REPORTS MODULE IPC HANDLERS (Sprint 5A)
// ========================================================

// REPORT SUMMARY CARDS (Sprint 5B)
ipcMain.on("get-report-summary", (event) => {
  const summary = {};
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const future7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const future7Date = `${future7.getFullYear()}-${String(future7.getMonth() + 1).padStart(2, "0")}-${String(future7.getDate()).padStart(2, "0")}`;

  db.get(`SELECT COALESCE(SUM(CAST(amountPaid AS REAL)), 0) as totalRevenue, COALESCE(SUM(CAST(amountPending AS REAL)), 0) as totalPending FROM members`, [], (err, row) => {
    if (err) return event.reply("get-report-summary-response", { success: false, error: err.message });
    summary.totalRevenue = Math.round(row.totalRevenue);
    summary.totalPending = Math.round(row.totalPending);

    db.get(`SELECT COUNT(*) as count FROM members WHERE status = 'Active'`, [], (err2, row2) => {
      if (err2) return event.reply("get-report-summary-response", { success: false, error: err2.message });
      summary.activeMembers = row2.count;

      db.get(`SELECT COUNT(*) as count FROM members WHERE status = 'Active' AND expiryDate >= ? AND expiryDate <= ?`, [today, future7Date], (err3, row3) => {
        if (err3) return event.reply("get-report-summary-response", { success: false, error: err3.message });
        summary.expiringMembers = row3.count;

        db.get(`SELECT COUNT(*) as count FROM attendance WHERE date = ?`, [today], (err4, row4) => {
          if (err4) return event.reply("get-report-summary-response", { success: false, error: err4.message });
          summary.todayAttendance = row4.count;

          event.reply("get-report-summary-response", { success: true, data: summary });
        });
      });
    });
  });
});

// PDF EXPORT (Sprint 5B) — Uses Electron's built-in printToPDF via hidden BrowserWindow
ipcMain.on("export-report-pdf", async (event, payload) => {
  const { title, headers, rows, subtitle, summaryCards, defaultFilename } = payload;
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Report as PDF",
      defaultPath: defaultFilename || "report.pdf",
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) {
      return event.reply("export-report-pdf-response", { success: false, canceled: true });
    }

    // Build HTML content for PDF
    const summaryHtml = summaryCards && summaryCards.length > 0
      ? `<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">${summaryCards.map(c => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;flex:1;min-width:120px;"><span style="display:block;font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${c.label}</span><span style="display:block;font-size:14px;font-weight:900;color:#0f172a;margin-top:2px;">${c.value}</span></div>`).join("")}</div>`
      : "";

    const tableHtml = rows.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <thead><tr>${headers.map(h => `<th style="background:#f1f5f9;border:1px solid #e2e8f0;padding:6px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#475569;">${h}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">${row.map(cell => `<td style="border:1px solid #e2e8f0;padding:5px 10px;font-size:10px;color:#334155;">${cell ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>`
      : `<p style="text-align:center;color:#94a3b8;padding:32px;font-size:12px;">No data available.</p>`;

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial,sans-serif;padding:24px;color:#1e293b;font-size:11px;}</style></head><body>
      <div style="text-align:center;margin-bottom:16px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;">
        <h1 style="font-size:18px;font-weight:900;color:#0f172a;">${title}</h1>
        ${subtitle ? `<p style="font-size:10px;color:#64748b;margin-top:4px;">${subtitle}</p>` : ""}
        <p style="font-size:10px;color:#64748b;margin-top:4px;">Generated: ${new Date().toLocaleString()}</p>
      </div>
      ${summaryHtml}${tableHtml}
      <div style="margin-top:16px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;">SENOVA Gym Management System</div>
    </body></html>`;

    // Create hidden window for PDF generation
    const pdfWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    pdfWindow.webContents.on("did-finish-load", async () => {
      try {
        const pdfBuffer = await pdfWindow.webContents.printToPDF({
          marginsType: 0,
          printBackground: true,
          landscape: false,
          pageSize: "A4",
        });
        fs.writeFileSync(result.filePath, pdfBuffer);
        event.reply("export-report-pdf-response", { success: true, filePath: result.filePath });
      } catch (pdfErr) {
        event.reply("export-report-pdf-response", { success: false, error: pdfErr.message });
      } finally {
        pdfWindow.close();
      }
    });
  } catch (err) {
    event.reply("export-report-pdf-response", { success: false, error: err.message });
  }
});

ipcMain.on("get-report-pending-payments", (event, filters) => {
  const params = [];
  let whereClause = `WHERE CAST(amountPending AS REAL) > 0`;
  
  if (filters && filters.plan) { whereClause += ` AND plan = ?`; params.push(filters.plan); }
  if (filters && filters.trainer) { whereClause += ` AND assignedTrainerId = ?`; params.push(filters.trainer); }
  if (filters && filters.status) { whereClause += ` AND status = ?`; params.push(filters.status); }

  db.all(
    `SELECT id, name, phone, plan, amountPaid, amountPending, expiryDate, status, assignedTrainerId FROM members ${whereClause} ORDER BY CAST(amountPending AS REAL) DESC`,
    params,
    (err, rows) => {
      if (err) event.reply("get-report-pending-payments-response", { success: false, error: err.message });
      else event.reply("get-report-pending-payments-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-expiring-members", (event, payload) => {
  // Backward compatible: payload can be a number (days) or an object {days, plan, trainer}
  let days = 7, plan = null, trainer = null;
  if (typeof payload === "number") {
    days = payload;
  } else if (payload && typeof payload === "object") {
    days = payload.days || 7;
    plan = payload.plan || null;
    trainer = payload.trainer || null;
  }
  
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const futureDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  
  const params = [today, futureDate];
  let whereClause = `WHERE status = 'Active' AND expiryDate >= ? AND expiryDate <= ?`;
  
  if (plan) { whereClause += ` AND plan = ?`; params.push(plan); }
  if (trainer) { whereClause += ` AND assignedTrainerId = ?`; params.push(trainer); }
  
  db.all(
    `SELECT id, name, phone, plan, expiryDate, status, assignedTrainerId FROM members ${whereClause} ORDER BY expiryDate ASC`,
    params,
    (err, rows) => {
      if (err) event.reply("get-report-expiring-members-response", { success: false, error: err.message });
      else event.reply("get-report-expiring-members-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-attendance-range", (event, payload) => {
  const { startDate, endDate } = payload;
  db.all(
    `SELECT * FROM attendance WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC`,
    [startDate, endDate],
    (err, rows) => {
      if (err) event.reply("get-report-attendance-range-response", { success: false, error: err.message });
      else event.reply("get-report-attendance-range-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-revenue-summary", (event, filters) => {
  const params = [];
  let whereClause = "";
  
  if (filters && filters.plan) { whereClause += (whereClause ? " AND" : " WHERE") + ` plan = ?`; params.push(filters.plan); }
  if (filters && filters.year) { whereClause += (whereClause ? " AND" : " WHERE") + ` substr(joinDate, 1, 4) = ?`; params.push(filters.year); }
  if (filters && filters.month) { whereClause += (whereClause ? " AND" : " WHERE") + ` substr(joinDate, 6, 2) = ?`; params.push(filters.month); }

  db.all(
    `SELECT plan, COUNT(*) as memberCount, SUM(CAST(amountPaid AS REAL)) as totalPaid, SUM(CAST(amountPending AS REAL)) as totalPending FROM members${whereClause} GROUP BY plan ORDER BY totalPaid DESC`,
    params,
    (err, rows) => {
      if (err) event.reply("get-report-revenue-summary-response", { success: false, error: err.message });
      else event.reply("get-report-revenue-summary-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-member-growth", (event, filters) => {
  const params = [];
  let whereClause = `WHERE joinDate IS NOT NULL AND joinDate != ''`;
  
  if (filters && filters.year) { whereClause += ` AND substr(joinDate, 1, 4) = ?`; params.push(filters.year); }
  if (filters && filters.month) { whereClause += ` AND substr(joinDate, 6, 2) = ?`; params.push(filters.month); }
  if (filters && filters.plan) { whereClause += ` AND plan = ?`; params.push(filters.plan); }

  db.all(
    `SELECT substr(joinDate, 1, 7) as month, COUNT(*) as count FROM members ${whereClause} GROUP BY month ORDER BY month ASC`,
    params,
    (err, rows) => {
      if (err) event.reply("get-report-member-growth-response", { success: false, error: err.message });
      else event.reply("get-report-member-growth-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-trainer-load", (event) => {
  db.all(`SELECT * FROM trainers ORDER BY id DESC`, [], (err, trainers) => {
    if (err) return event.reply("get-report-trainer-load-response", { success: false, error: err.message });
    db.all(
      `SELECT assignedTrainerId, COUNT(*) as clientCount FROM members WHERE status = 'Active' AND assignedTrainerId != 'None' GROUP BY assignedTrainerId`,
      [],
      (memErr, counts) => {
        if (memErr) return event.reply("get-report-trainer-load-response", { success: false, error: memErr.message });
        const countMap = {};
        (counts || []).forEach((c) => { countMap[String(c.assignedTrainerId)] = c.clientCount; });
        const result = trainers.map((t) => ({
          id: t.id,
          name: t.name,
          specialization: t.specialization,
          phone: t.phone,
          activeClients: countMap[String(t.id)] || 0,
        }));
        event.reply("get-report-trainer-load-response", { success: true, data: result });
      }
    );
  });
});

ipcMain.on("export-report-csv", async (event, payload) => {
  const { headers, rows, defaultFilename } = payload;
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Report as CSV",
      defaultPath: defaultFilename || "report.csv",
      filters: [{ name: "CSV Files", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePath) {
      return event.reply("export-report-csv-response", { success: false, canceled: true });
    }
    const escapeCsv = (val) => {
      const str = String(val == null ? "" : val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const csvLines = [headers.map(escapeCsv).join(",")];
    rows.forEach((row) => { csvLines.push(row.map(escapeCsv).join(",")); });
    fs.writeFileSync(result.filePath, "\uFEFF" + csvLines.join("\n"), "utf8");
    event.reply("export-report-csv-response", { success: true, filePath: result.filePath });
  } catch (err) {
    event.reply("export-report-csv-response", { success: false, error: err.message });
  }
});

app.on("window-all-closed", () => {
  void cameraServer.stopAllSessions();
  if (whatsappClient) {
    whatsappClient.destroy().catch(() => {});
    whatsappClient = null;
  }
  if (process.platform !== "darwin") app.quit();
});
