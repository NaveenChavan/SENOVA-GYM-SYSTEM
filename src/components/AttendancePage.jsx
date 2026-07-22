import React, { useState, useEffect, useRef, useCallback } from "react";
import useGymStore from "../store/gymStore";
import { useUI } from "../context/UIContext";
const windowElectron = window.electron || null;

// Renders a member's registered photo (or an initial-letter fallback) so staff
// can visually verify identity at the gate. Photo comes from the existing
// members store; no attendance-table or camera changes are involved.
const MemberAvatar = ({ src, name, className }) =>
  src ? (
    <img
      src={src}
      alt={name ? `${name} photo` : "Member photo"}
      className={`${className} object-cover rounded-full border border-slate-200 bg-slate-100`}
    />
  ) : (
    <div
      className={`${className} rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-400`}
      aria-hidden="true"
    >
      {name?.trim()?.charAt(0)?.toUpperCase() || "?"}
    </div>
  );

const AttendancePage = () => {
  // Consume from centralized store
  const membersList = useGymStore((state) => state.members);
  const settings = useGymStore((state) => state.settings);
  const { showToast } = useUI();

  // Hardening 4: configurable match threshold, persisted via the existing
  // save-settings/get-settings IPC (key: faceMatchThreshold). Falls back to
  // the library default (0.5) until Settings has been saved at least once, or
  // if the stored value is missing/invalid.
  const matchThreshold = (() => {
    const stored = Number(settings.faceMatchThreshold);
    return Number.isFinite(stored) && stored > 0 && stored < 1 ? stored : null; // null = use lib default
  })();

  const [searchPhone, setSearchPhone] = useState("");
  const [scanResults, setScanResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [todayLog, setTodayLog] = useState([]);

  // History state
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split("T")[0]);
  const [historyData, setHistoryData] = useState([]);
  const [historySearch, setHistorySearch] = useState("");

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const inputRef = useRef(null);
  const historyDateRef = useRef(historyDate);

  // ─── Face-scan attendance state ──────────────────────────
  const [mode, setMode] = useState("phone"); // "phone" | "face"
  const [faceState, setFaceState] = useState("idle"); // idle|loading|preparing|ready|scanning|error
  const [facePrep, setFacePrep] = useState({ done: 0, total: 0 });
  const [faceError, setFaceError] = useState("");
  const [faceMsg, setFaceMsg] = useState("");
  const [isResyncing, setIsResyncing] = useState(false);
  const [multiFaceWarning, setMultiFaceWarning] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownTick, setCooldownTick] = useState(0); // forces re-render while cooldown counts down

  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const matcherRef = useRef(null);
  const faceLibRef = useRef(null);
  const membersRef = useRef(membersList);
  useEffect(() => { membersRef.current = membersList; }, [membersList]);
  const matchThresholdRef = useRef(matchThreshold);
  useEffect(() => { matchThresholdRef.current = matchThreshold; }, [matchThreshold]);

  // Hardening 2: scan cooldown — after a successful match + attendance mark,
  // ignore further scan attempts for a short window so a member lingering in
  // front of the camera doesn't repeatedly retrigger detection/duplicate
  // attempts. mark-attendance already blocks duplicate same-day check-ins
  // server-side; this cooldown is purely to stop spamming scan requests.
  const SCAN_COOLDOWN_MS = 6000;

  // Hardening 5: on-screen face guide — live bounding-box overlay drawn from
  // detectAllFaceBoxes during the preview, so staff can see when a face is
  // properly framed. Also backs the multi-face guard (Hardening 3).
  const faceOverlayCanvasRef = useRef(null);
  const faceGuideRafRef = useRef(null);
  const faceGuideActiveRef = useRef(false);

  // Lazy-load the heavy face-recognition module (face-api + TensorFlow.js) only
  // when Face Scan is actually used, so it does not bloat app startup.
  //
  // Previously this also had to hide Node globals (process/module/require/
  // Buffer) for the duration of the import + model load, because the renderer
  // ran with nodeIntegration: true and exposed them for real — face-api and
  // TensorFlow.js auto-detect their runtime by checking for those globals, so
  // they wrongly concluded "Node.js" and tried to read model files from the
  // filesystem instead of fetch()ing them, hitting a JS/binary file and
  // throwing trying to parse it as JSON ("Unexpected token '('"). That was a
  // runtime patch working around an unreliable signal (globals can be
  // non-configurable, and TF.js caches its environment detection as a
  // singleton that can keep a stale answer across reloads even after
  // deleting them). Now that main.js's BrowserWindow uses nodeIntegration:
  // false + contextIsolation: true + preload.js, those Node globals are
  // genuinely absent from the renderer, so face-api's own environment
  // detection correctly and permanently resolves to "browser" with no
  // patching needed here at all.
  const getFaceLib = useCallback(async () => {
    if (faceLibRef.current) return faceLibRef.current;
    const lib = await import("../services/faceRecognition");
    faceLibRef.current = lib;
    return faceLibRef.current;
  }, []);

  const fetchTodayAttendance = () => {
    if (windowElectron) windowElectron.ipcRenderer.send("get-today-attendance");
  };

  const fetchHistory = (date) => {
    if (windowElectron) windowElectron.ipcRenderer.send("get-attendance-history", date);
  };

  const handleHistoryDateChange = (e) => {
    const newDate = e.target.value;
    setHistoryDate(newDate);
    historyDateRef.current = newDate;
    fetchHistory(newDate);
  };

  useEffect(() => {
    if (!windowElectron) return;

    const handleMarkResponse = (_e, arg) => {
      if (arg.success) {
        showToastRef.current("Attendance marked successfully!", "success");
        fetchTodayAttendance();
        fetchHistory(historyDateRef.current);
      } else if (arg.duplicate) {
        showToastRef.current("Attendance already marked for today.", "warning");
      } else {
        showToastRef.current(arg.error || "Failed to mark attendance.", "error");
      }
    };

    const handleTodayResponse = (_e, arg) => {
      if (arg.success) setTodayLog(arg.data || []);
    };

    const handleHistoryResponse = (_e, arg) => {
      if (arg.success) setHistoryData(arg.data || []);
    };

    windowElectron.ipcRenderer.on("mark-attendance-response", handleMarkResponse);
    windowElectron.ipcRenderer.on("get-today-attendance-response", handleTodayResponse);
    windowElectron.ipcRenderer.on("get-attendance-history-response", handleHistoryResponse);

    fetchTodayAttendance();
    fetchHistory(new Date().toISOString().split("T")[0]);

    return () => {
      windowElectron.ipcRenderer.removeListener("mark-attendance-response", handleMarkResponse);
      windowElectron.ipcRenderer.removeListener("get-today-attendance-response", handleTodayResponse);
      windowElectron.ipcRenderer.removeListener("get-attendance-history-response", handleHistoryResponse);
    };
  }, []);

  // Shared: evaluate access (status + expiry), auto-mark attendance when granted,
  // and return a result card object. Used by both phone entry and face scan.
  const evaluateAndMark = (member, extra = {}) => {
    const today = new Date();
    const expiry = new Date(member.expiryDate);
    const isExpired = today > expiry;
    const accessGranted = !isExpired && member.status === "Active";
    const gateMessage =
      member.status === "Frozen"
        ? "Access Denied: Account is Frozen! 🧊"
        : isExpired
          ? "Access Denied: Membership Expired! ❌"
          : "Access Granted: Welcome Active Member! 🎉";

    if (accessGranted && windowElectron) {
      windowElectron.ipcRenderer.send("mark-attendance", {
        memberId: member.id,
        memberName: member.name,
        phone: member.phone,
      });
    }

    return {
      id: member.id,
      success: accessGranted,
      name: member.name,
      plan: member.plan,
      status: member.status,
      expiryDate: member.expiryDate,
      message: gateMessage,
      photo: member.photo || null,
      ...extra,
    };
  };

  const triggerMockScan = () => {
    const trimmedInput = searchPhone.trim();
    if (!trimmedInput)
      return showToast(
        "Please enter a mobile number to simulate the biometric trigger loop!",
        "warning",
      );

    setHasSearched(true);
    const matchedMembers = membersList.filter((m) => m.phone === trimmedInput);

    if (matchedMembers.length > 0) {
      setScanResults(matchedMembers.map((member) => evaluateAndMark(member)));
    } else {
      setScanResults([]);
    }

    setSearchPhone("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ─── Face-scan camera + matcher lifecycle ────────────────
  const stopFaceCamera = useCallback(() => {
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
    if (faceVideoRef.current) faceVideoRef.current.srcObject = null;
  }, []);

  const startFaceCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      faceStreamRef.current = stream;
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
        await faceVideoRef.current.play().catch(() => {});
      }
      return true;
    } catch (error) {
      // Hardening 8: distinct prefix so a denied-camera failure is never
      // visually confused with [face-v2/models] (Defect 1's failure mode) or
      // [face-v2/matcher] in the UI or logs.
      setFaceError(
        error.name === "NotAllowedError"
          ? "[face-v2/camera] Camera permission was denied. Allow camera access and retry."
          : `[face-v2/camera] Camera unavailable: ${error.message || error.name}`,
      );
      setFaceState("error");
      return false;
    }
  }, []);

  // Load models, build (and backfill) member face descriptors, prepare matcher.
  // `force` (Hardening 1: Resync Faces) ignores any cached member.faceDescriptor
  // and recomputes every member's descriptor from their stored photo, then
  // re-saves it — for after a bulk photo re-upload or a threshold change.
  const prepareFace = useCallback(async (force = false) => {
    setFaceError("");
    setFaceState("loading");

    // Improvement 1: each stage gets its own distinct error prefix
    // ([face-v2/import] / [face-v2/models] / [face-v2/warmup]) instead of
    // lumping the dynamic import, model loading, and TF.js backend warmup
    // under one generic [face-v2/engine] label — so a future failure tells
    // you immediately which stage broke.
    let lib;
    try {
      lib = await getFaceLib();
    } catch (error) {
      console.error("[FaceScan] Failed to import the face-recognition module:", error);
      setFaceError(`[face-v2/import] ${error.message || error} — ${String(error.stack || "").split("\n")[1] || ""}`);
      setFaceState("error");
      return;
    }
    try {
      await lib.loadModels();
    } catch (error) {
      console.error("[FaceScan] Failed to load models from /models:", error);
      setFaceError(`[face-v2/models] ${error.message || error} — ${String(error.stack || "").split("\n")[1] || ""}`);
      setFaceState("error");
      return;
    }
    try {
      await lib.warmup();
    } catch (error) {
      console.error("[FaceScan] Failed to warm up the TensorFlow.js backend:", error);
      setFaceError(`[face-v2/warmup] ${error.message || error} — ${String(error.stack || "").split("\n")[1] || ""}`);
      setFaceState("error");
      return;
    }

    setFaceState("preparing");
    const withPhoto = (membersRef.current || []).filter((m) => m.photo);
    setFacePrep({ done: 0, total: withPhoto.length });

    const labeled = [];
    let done = 0;
    for (const member of withPhoto) {
      let descriptor = force ? null : lib.arrayToDescriptor(member.faceDescriptor);
      if (!descriptor) {
        try {
          descriptor = await lib.computeDescriptorFromDataUrl(member.photo);
          if (descriptor && windowElectron) {
            windowElectron.ipcRenderer.send("save-face-descriptor", {
              id: member.id,
              descriptor: lib.descriptorToArray(descriptor),
            });
          }
        } catch {
          descriptor = null;
        }
      }
      if (descriptor) labeled.push({ label: String(member.id), descriptors: [descriptor] });
      done += 1;
      setFacePrep({ done, total: withPhoto.length });
    }

    const effectiveThreshold = matchThresholdRef.current ?? lib.MATCH_THRESHOLD;
    try {
      matcherRef.current = await lib.buildMatcher(labeled, effectiveThreshold);
    } catch (error) {
      // buildMatcher throws a [face-v2/matcher]-prefixed error (Hardening 8).
      console.error("[FaceScan] Failed to build face matcher:", error);
      setFaceError(error.message || String(error));
      setFaceState("error");
      return;
    }
    if (!matcherRef.current) {
      setFaceError("[face-v2/matcher] No usable member face photos found. Register members with a clear, front-facing photo first.");
      setFaceState("error");
      return;
    }
    setFaceMsg("Position the member's face in the frame, then click Scan Face.");
    setFaceState("ready");
  }, [getFaceLib]);

  // Hardening 1: Resync Faces — force-recompute and re-save descriptors for
  // every member with a photo, overwriting any cached ones. Useful after a
  // bulk photo re-upload or after tuning the match threshold in Settings.
  const resyncFaces = useCallback(async () => {
    setIsResyncing(true);
    try {
      await prepareFace(true);
      showToastRef.current("Face data resynced for all members with a photo.", "success");
    } finally {
      setIsResyncing(false);
    }
  }, [prepareFace]);

  const scanFace = async () => {
    if (faceState !== "ready") return;

    // Hardening 2: scan cooldown — ignore further scan attempts for a short
    // window after a successful match so a lingering member doesn't spam
    // repeat attendance attempts.
    if (Date.now() < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setFaceMsg(`Please wait ${remaining}s before scanning again.`);
      return;
    }

    const video = faceVideoRef.current;
    if (!video || !video.videoWidth) {
      setFaceMsg("Camera is not ready yet.");
      return;
    }

    setFaceState("scanning");
    setFaceMsg("Scanning…");
    setMultiFaceWarning(false);

    let lib;
    try {
      lib = await getFaceLib();
    } catch (error) {
      setFaceMsg(`Scan failed: ${error.message || "try again."}`);
      setFaceState("ready");
      return;
    }

    // Hardening 3: multi-face guard — detectAllFaces (not just
    // detectSingleFace) so we can tell "two people in frame" apart from
    // "detectSingleFace happened to pick one of several faces".
    let boxes;
    try {
      boxes = await lib.detectAllFaceBoxes(video);
    } catch (error) {
      setFaceMsg(`Scan failed: ${error.message || "try again."}`);
      setFaceState("ready");
      return;
    }
    if (boxes.length > 1) {
      setMultiFaceWarning(true);
      setFaceMsg("Multiple faces detected — one person at a time.");
      setFaceState("ready");
      return;
    }

    let descriptor;
    try {
      descriptor = await lib.computeDescriptor(video);
    } catch (error) {
      setFaceMsg(`Scan failed: ${error.message || "try again."}`);
      setFaceState("ready");
      return;
    }

    if (!descriptor) {
      setFaceMsg("No face detected. Move closer and face the camera directly.");
      setFaceState("ready");
      return;
    }

    const effectiveThreshold = matchThresholdRef.current ?? lib.MATCH_THRESHOLD;
    const match = lib.matchDescriptor(matcherRef.current, descriptor);
    if (!match || !match.matched) {
      setHasSearched(true);
      setScanResults([]);
      setFaceMsg(
        `No confident match${match ? ` (closest distance ${match.distance.toFixed(2)}, need < ${effectiveThreshold})` : ""}. Not a registered member, or lighting/angle too different.`,
      );
      setFaceState("ready");
      return;
    }

    const member = (membersRef.current || []).find((m) => String(m.id) === match.label);
    if (!member) {
      setFaceMsg("Matched a record that no longer exists. Re-sync faces.");
      setFaceState("ready");
      return;
    }

    setHasSearched(true);
    setScanResults([evaluateAndMark(member, { matchDistance: match.distance })]);
    setFaceMsg(`Matched ${member.name} (distance ${match.distance.toFixed(2)}).`);
    setFaceState("ready");
    // Start the cooldown only after a successful match+mark, not after every
    // scan attempt, so failed/no-match scans can be retried immediately.
    setCooldownUntil(Date.now() + SCAN_COOLDOWN_MS);
  };

  // Enter/leave face mode: start camera + prepare matcher; tear down on exit.
  useEffect(() => {
    if (mode !== "face") {
      stopFaceCamera();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const ok = await startFaceCamera();
      if (!ok || cancelled) return;
      await prepareFace();
    })();
    return () => {
      cancelled = true;
      stopFaceCamera();
    };
  }, [mode, startFaceCamera, prepareFace, stopFaceCamera]);

  // Hardening 4: face-api's FaceMatcher has no threshold setter (distanceThreshold
  // is read-only, see @vladmandic/face-api's typings), so applying a new
  // Settings threshold to an already-open Face Scan session requires rebuilding
  // the matcher. Re-running prepareFace() here (cheap: descriptors are already
  // cached in member.faceDescriptor / matcherRef inputs) means the new value
  // takes effect immediately, without restarting the app.
  const prevThresholdRef = useRef(matchThreshold);
  useEffect(() => {
    if (mode !== "face") {
      prevThresholdRef.current = matchThreshold;
      return;
    }
    if (prevThresholdRef.current === matchThreshold) return;
    prevThresholdRef.current = matchThreshold;
    if (faceState === "ready" || faceState === "error") {
      prepareFace();
    }
  }, [matchThreshold, mode, faceState, prepareFace]);

  // Hardening 5: on-screen face guide — draws a bounding-box overlay from
  // detectAllFaceBoxes on every animation frame while the camera is ready, so
  // staff can see when a face is properly framed before scanning. Also
  // recolors red when more than one face is present, previewing the
  // multi-face guard (Hardening 3) before the member even presses Scan.
  useEffect(() => {
    faceGuideActiveRef.current = mode === "face" && (faceState === "ready" || faceState === "scanning");
    if (!faceGuideActiveRef.current) {
      const canvas = faceOverlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return undefined;
    }

    let stopped = false;
    const tick = async () => {
      if (stopped || !faceGuideActiveRef.current) return;
      const video = faceVideoRef.current;
      const canvas = faceOverlayCanvasRef.current;
      const lib = faceLibRef.current;
      if (video && canvas && lib && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        try {
          const boxes = await lib.detectAllFaceBoxes(video);
          const strokeColor = boxes.length > 1 ? "#f43f5e" : boxes.length === 1 ? "#22c55e" : "#94a3b8";
          ctx.lineWidth = 3;
          ctx.strokeStyle = strokeColor;
          boxes.forEach(({ box }) => {
            // Mirror the box horizontally to match the video's -scale-x-100
            // (mirrored preview) CSS transform.
            const mirroredX = canvas.width - box.x - box.width;
            ctx.strokeRect(mirroredX, box.y, box.width, box.height);
          });
        } catch {
          // Best-effort overlay; a transient detection failure just skips a frame.
        }
      }
      faceGuideRafRef.current = requestAnimationFrame(tick);
    };
    faceGuideRafRef.current = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      if (faceGuideRafRef.current) cancelAnimationFrame(faceGuideRafRef.current);
      faceGuideRafRef.current = null;
    };
  }, [mode, faceState]);

  // Ticks once a second while a cooldown is active, purely to force a
  // re-render so the Scan button's disabled state (Date.now() < cooldownUntil)
  // and the "wait Ns" message update without requiring another scan attempt.
  useEffect(() => {
    if (Date.now() >= cooldownUntil) return undefined;
    const interval = setInterval(() => setCooldownTick((t) => t + 1), 500);
    return () => clearInterval(interval);
  }, [cooldownUntil, cooldownTick]);

  const filteredHistory = historyData.filter((entry) => {
    if (!historySearch.trim()) return true;
    const term = historySearch.trim().toLowerCase();
    return entry.memberName.toLowerCase().includes(term) || entry.phone.includes(term);
  });

  // Attendance rows store no photo, so look it up from the members store by
  // memberId (preferred) or phone. Members whose record was deleted simply
  // fall back to the initial-letter avatar.
  const memberPhotoLookup = React.useMemo(() => {
    const map = {};
    membersList.forEach((m) => {
      if (!m.photo) return;
      map[`id:${m.id}`] = m.photo;
      if (m.phone) map[`phone:${m.phone}`] = m.photo;
    });
    return map;
  }, [membersList]);

  const photoForEntry = (entry) =>
    memberPhotoLookup[`id:${entry.memberId}`] || memberPhotoLookup[`phone:${entry.phone}`] || null;

  return (
    <div className="p-8 space-y-6 bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            🛂
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Biometric Attendance Interface
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Gateway validation system with real-time Frozen status
              synchronization.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4 h-fit">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
            ⚙️ Device Terminal
          </h3>

          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("phone")}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === "phone" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
            >
              🔢 Phone Number
            </button>
            <button
              type="button"
              onClick={() => setMode("face")}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === "face" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
            >
              🙂 Face Scan
            </button>
          </div>

          {mode === "phone" ? (
            <>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5 font-bold">
                  Scan Card / Mobile Sequence
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && triggerMockScan()}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                  placeholder="Enter phone number..."
                />
              </div>
              <button
                onClick={triggerMockScan}
                className="w-full bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl shadow-md hover:bg-blue-700 transition-all uppercase tracking-wider"
              >
                Trigger Scanner Sensor Pulse
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-[4/3]">
                <video
                  ref={faceVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover -scale-x-100"
                />
                <canvas
                  ref={faceOverlayCanvasRef}
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  aria-hidden="true"
                />
                {(faceState === "loading" || faceState === "preparing") && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 text-center text-white">
                    <span className="mb-2 animate-pulse text-2xl">🧠</span>
                    <p className="text-xs font-bold">
                      {faceState === "loading"
                        ? "Loading face models…"
                        : `Preparing member faces (${facePrep.done}/${facePrep.total})…`}
                    </p>
                  </div>
                )}
              </div>

              {multiFaceWarning && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700" role="alert">
                  🚫 Multiple faces detected — one person at a time.
                </div>
              )}
              {faceError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700" role="alert">
                  {faceError}
                </div>
              )}
              {!faceError && !multiFaceWarning && faceMsg && (
                <p className="text-[11px] font-semibold text-slate-500">{faceMsg}</p>
              )}

              <button
                onClick={scanFace}
                disabled={faceState !== "ready" || Date.now() < cooldownUntil}
                className="w-full bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl shadow-md hover:bg-blue-700 transition-all uppercase tracking-wider disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {faceState === "scanning"
                  ? "Scanning…"
                  : Date.now() < cooldownUntil
                    ? `⏳ Cooldown (${Math.ceil((cooldownUntil - Date.now()) / 1000)}s)`
                    : "📸 Scan Face & Mark Attendance"}
              </button>
              {faceState === "error" && (
                <button
                  onClick={() => { setMode("phone"); setTimeout(() => setMode("face"), 0); }}
                  className="w-full rounded-xl border border-blue-300 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={resyncFaces}
                disabled={isResyncing || faceState === "loading" || faceState === "preparing"}
                className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                title="Force-recompute and re-save face descriptors for all members with a photo — use after a bulk photo re-upload or changing the match threshold."
              >
                {isResyncing ? "🔄 Resyncing…" : "🔄 Resync Faces"}
              </button>
              <p className="text-[10px] leading-snug text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                ⚠️ Face match is a convenience check, not secure identity proof — a
                printed photo or phone screen can fool it. Use the fingerprint upgrade
                for real verification.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
            Gate Authentication Result
          </h3>
          <div className="space-y-3 min-h-[250px] flex flex-col justify-start">
            {!hasSearched ? (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-400 py-12 text-center">
                <span className="text-3xl mb-2 animate-pulse">📡</span>
                <p className="text-xs font-bold">
                  Waiting for scanner terminal sensor signal input...
                </p>
              </div>
            ) : scanResults.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-rose-500 py-12 text-center bg-rose-50/40 border border-dashed border-rose-200 rounded-xl">
                <span className="text-2xl mb-1">❌</span>
                <p className="text-sm font-black">
                  Access Denied: Record Missing!
                </p>
              </div>
            ) : (
              scanResults.map((result) => (
                <div
                  key={result.id}
                  className={`border rounded-xl p-5 flex justify-between items-center ${result.success ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"}`}
                >
                  <div className="flex items-center gap-4">
                    <MemberAvatar
                      src={result.photo}
                      name={result.name}
                      className={`w-16 h-16 shrink-0 text-xl ${result.success ? "ring-2 ring-emerald-300" : "ring-2 ring-rose-300"}`}
                    />
                    <div>
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        {result.name}
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${result.success ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}
                        >
                          {result.status}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 font-semibold">
                        Plan: {result.plan} •{" "}
                        <span className="font-mono">
                          Expiry: {result.expiryDate}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-black ${result.success ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {result.success ? "ACCESS GRANTED" : "ACCESS DENIED"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      {result.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Today's Attendance Log */}
      <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
            📋 Today's Attendance ({todayLog.length})
          </h3>
          <span className="text-[10px] font-bold text-slate-400">
            {new Date().toISOString().split("T")[0]}
          </span>
        </div>
        {todayLog.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            No attendance records for today yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {todayLog.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center py-2.5">
                <div className="flex items-center gap-3">
                  <MemberAvatar src={photoForEntry(entry)} name={entry.memberName} className="w-9 h-9 shrink-0 text-xs" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{entry.memberName}</p>
                    <p className="text-[11px] font-mono text-slate-400">{entry.phone}</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-slate-500 font-mono">
                  {new Date(entry.checkInTime).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance History */}
      <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">
          📅 Attendance History
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="date"
            value={historyDate}
            onChange={handleHistoryDateChange}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
          <input
            type="text"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>
        <p className="text-[11px] font-bold text-slate-400">
          Total Records: {filteredHistory.length}
        </p>
        {filteredHistory.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            No attendance records found for this date.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
            {filteredHistory.map((entry) => (
              <div key={entry.id} className="flex justify-between items-center py-2.5">
                <div className="flex items-center gap-3">
                  <MemberAvatar src={photoForEntry(entry)} name={entry.memberName} className="w-9 h-9 shrink-0 text-xs" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{entry.memberName}</p>
                    <p className="text-[11px] font-mono text-slate-400">{entry.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 font-mono">
                    {new Date(entry.checkInTime).toLocaleTimeString()}
                  </span>
                  <p className="text-[10px] text-slate-400 font-mono">{entry.date}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendancePage;
