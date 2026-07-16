const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Client, LocalAuth } = require("whatsapp-web.js");

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
    try { fs.unlinkSync(path.join(sessionPath, name)); } catch (_) {}
  });
  // LevelDB LOCK files inside Default/ (recursive)
  const defaultPath = path.join(sessionPath, "Default");
  try {
    removeLockFilesRecursive(defaultPath);
  } catch (_) {}
}

function removeLockFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeLockFilesRecursive(fullPath);
    } else if (entry.name === "LOCK") {
      try { fs.unlinkSync(fullPath); } catch (_) {}
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
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  mainWindow.loadURL("http://localhost:5173");

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
  } = memberData;

  // Prevent duplicate mobile numbers before database insert
  db.get(`SELECT id FROM members WHERE phone = ?`, [phone], (checkErr, existing) => {
    if (checkErr) {
      return event.reply("add-member-response", { success: false, error: checkErr.message });
    }
    if (existing) {
      return event.reply("add-member-response", { success: false, error: "A member with this mobile number already exists." });
    }

    const query = `INSERT INTO members (name, phone, age, sex, plan, paymentMode, amountPaid, amountPending, joinDate, joinTime, expiryDate, assignedTrainerId, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
  } = payload;

  // Prevent duplicate phone on edit (exclude current member)
  db.get(`SELECT id FROM members WHERE phone = ? AND id != ?`, [phone, id], (checkErr, existing) => {
    if (checkErr) {
      return event.reply("update-member-response", { success: false, error: checkErr.message });
    }
    if (existing) {
      return event.reply("update-member-response", { success: false, error: "Another member with this mobile number already exists." });
    }

    const query = `UPDATE members SET name=?, phone=?, age=?, sex=?, plan=?, paymentMode=?, amountPaid=?, amountPending=?, status=?, assignedTrainerId=?, joinDate=COALESCE(?, joinDate), joinTime=COALESCE(?, joinTime) WHERE id=?`;
    db.run(
      query,
      [
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
        id,
      ],
      function (err) {
        if (err) {
          event.reply("update-member-response", { success: false, error: err.message });
        } else {
          event.reply("update-member-response", { success: true });
          broadcastMembersList();
          broadcastTrainersAndMembers();
        }
      },
    );
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
  Object.keys(settingsData).forEach((key) =>
    stmt.run(key, JSON.stringify(settingsData[key])),
  );
  stmt.finalize(() => event.reply("save-settings-response", { success: true }));
});

ipcMain.on("get-settings", (event) => {
  db.all(`SELECT * FROM settings`, [], (err, rows) => {
    if (!err) {
      const config = {};
      rows.forEach((row) => {
        config[row.key] = JSON.parse(row.value);
      });
      event.reply("get-settings-response", { success: true, data: config });
    }
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

ipcMain.on("get-report-pending-payments", (event) => {
  db.all(
    `SELECT id, name, phone, plan, amountPaid, amountPending, expiryDate, status FROM members WHERE CAST(amountPending AS REAL) > 0 ORDER BY CAST(amountPending AS REAL) DESC`,
    [],
    (err, rows) => {
      if (err) event.reply("get-report-pending-payments-response", { success: false, error: err.message });
      else event.reply("get-report-pending-payments-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-expiring-members", (event, days) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const future = new Date(now.getTime() + (days || 7) * 24 * 60 * 60 * 1000);
  const futureDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  db.all(
    `SELECT id, name, phone, plan, expiryDate, status, assignedTrainerId FROM members WHERE status = 'Active' AND expiryDate >= ? AND expiryDate <= ? ORDER BY expiryDate ASC`,
    [today, futureDate],
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

ipcMain.on("get-report-revenue-summary", (event) => {
  db.all(
    `SELECT plan, COUNT(*) as memberCount, SUM(CAST(amountPaid AS REAL)) as totalPaid, SUM(CAST(amountPending AS REAL)) as totalPending FROM members GROUP BY plan ORDER BY totalPaid DESC`,
    [],
    (err, rows) => {
      if (err) event.reply("get-report-revenue-summary-response", { success: false, error: err.message });
      else event.reply("get-report-revenue-summary-response", { success: true, data: rows });
    }
  );
});

ipcMain.on("get-report-member-growth", (event) => {
  db.all(
    `SELECT substr(joinDate, 1, 7) as month, COUNT(*) as count FROM members WHERE joinDate IS NOT NULL AND joinDate != '' GROUP BY month ORDER BY month ASC`,
    [],
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
  if (whatsappClient) {
    whatsappClient.destroy().catch(() => {});
    whatsappClient = null;
  }
  if (process.platform !== "darwin") app.quit();
});
