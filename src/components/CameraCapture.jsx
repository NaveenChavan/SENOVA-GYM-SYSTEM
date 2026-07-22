import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const electron = typeof window !== "undefined" ? window.electron || null : null;

const OUTPUT_SIZE = 480;
const JPEG_QUALITY = 0.8;

function drawSquare(source, sourceWidth, sourceHeight) {
  const size = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.max(0, (sourceWidth - size) / 2);
  const sourceY = Math.max(0, (sourceHeight - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  context.drawImage(
    source,
    sourceX,
    sourceY,
    size,
    size,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function normalizePhoto(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(drawSquare(image, image.naturalWidth, image.naturalHeight));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("The received image could not be decoded."));
    image.src = dataUrl;
  });
}

const statusText = {
  starting: "Starting secure camera session…",
  waiting: "Waiting for phone",
  received: "Photo received",
  saved: "Saved",
  expired: "Expired — generate a new QR code",
  error: "Camera unavailable",
};

const CameraCapture = ({ onCapture, onClose }) => {
  const [activeTab, setActiveTab] = useState("mobile");
  const [session, setSession] = useState(null);
  const [selectedIp, setSelectedIp] = useState("");
  const [ipCandidates, setIpCandidates] = useState([]);
  const [status, setStatus] = useState("starting");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const closeTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const mobileRequestRef = useRef(0);
  const usbRequestRef = useRef(0);

  const stopUsbStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopMobileSession = useCallback(async () => {
    const current = sessionRef.current;
    sessionRef.current = null;
    if (!current || !electron) return;
    try {
      await electron.ipcRenderer.invoke("stop-camera-session", current.sessionId);
    } catch {
      // Closing the modal/window can tear down IPC before this promise settles.
    }
  }, []);

  const startMobileSession = useCallback(async (ip) => {
    const requestId = ++mobileRequestRef.current;
    setError("");
    setPhoto(null);
    setSession(null);
    setStatus("starting");
    await stopMobileSession();

    if (!electron) {
      setStatus("error");
      setError("Mobile capture is available only in the Electron desktop app.");
      return;
    }

    try {
      const result = await electron.ipcRenderer.invoke("start-camera-session", ip ? { ip } : {});
      if (!mountedRef.current || requestId !== mobileRequestRef.current) {
        if (result?.sessionId) {
          void electron.ipcRenderer.invoke("stop-camera-session", result.sessionId);
        }
        return;
      }
      if (!result?.success) throw new Error(result?.error || "Could not start camera session.");

      const nextSession = {
        sessionId: result.sessionId,
        token: result.token,
        url: result.url,
        expiresAt: result.expiresAt,
      };
      sessionRef.current = nextSession;
      setSession(nextSession);
      setSelectedIp(result.ip || ip || "");
      setIpCandidates(Array.isArray(result.candidates) ? result.candidates : []);
      setStatus("waiting");
    } catch (startError) {
      if (!mountedRef.current || requestId !== mobileRequestRef.current) return;
      setSession(null);
      setStatus("error");
      setError(startError.message || "Could not start the mobile camera server.");
    }
  }, [stopMobileSession]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return [];
    }
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const cameras = allDevices.filter((device) => device.kind === "videoinput");
    setDevices(cameras);
    return cameras;
  }, []);

  const startUsbCamera = useCallback(async (deviceId = "") => {
    stopUsbStream();
    const requestId = ++usbRequestRef.current;
    setPhoto(null);
    setError("");
    setStatus("starting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("This device does not support camera access.");
      return;
    }

    try {
      const video = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
      if (deviceId) video.deviceId = { exact: deviceId };

      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (!mountedRef.current || activeTab !== "usb" || requestId !== usbRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const actualDeviceId = track?.getSettings?.().deviceId || deviceId;
      if (actualDeviceId) setSelectedDeviceId(actualDeviceId);

      track?.addEventListener("ended", () => {
        if (!mountedRef.current || requestId !== usbRequestRef.current) return;
        streamRef.current = null;
        void refreshDevices().then((cameras) => {
          if (mountedRef.current && requestId === usbRequestRef.current) {
            setSelectedDeviceId(cameras[0]?.deviceId || "");
          }
        }).catch(() => {});
        setStatus("error");
        setError("The selected camera was disconnected. Reconnect it and try again.");
      }, { once: true });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      await refreshDevices();
      if (mountedRef.current && requestId === usbRequestRef.current) setStatus("waiting");
    } catch (cameraError) {
      if (!mountedRef.current || requestId !== usbRequestRef.current) return;
      setStatus("error");
      if (cameraError.name === "NotAllowedError") {
        setError("Camera permission was denied. Allow camera access and try again.");
      } else if (cameraError.name === "OverconstrainedError" || cameraError.name === "NotFoundError") {
        setError("The selected camera is unavailable. Connect a camera and try again.");
      } else {
        setError(cameraError.message || "Could not start the USB camera.");
      }
      await refreshDevices().catch(() => {});
    }
  }, [activeTab, refreshDevices, stopUsbStream]);

  useEffect(() => {
    mountedRef.current = true;

    const handlePhoto = async (_event, payload) => {
      if (!payload || payload.sessionId !== sessionRef.current?.sessionId) return;
      setStatus("received");
      try {
        const normalized = await normalizePhoto(payload.photo);
        if (mountedRef.current && payload.sessionId === sessionRef.current?.sessionId) {
          setPhoto(normalized);
        }
      } catch (imageError) {
        if (!mountedRef.current || payload.sessionId !== sessionRef.current?.sessionId) return;
        setStatus("error");
        setError(imageError.message || "The phone photo could not be processed.");
      }
    };

    const handleExpired = (_event, payload) => {
      if (!payload || payload.sessionId !== sessionRef.current?.sessionId) return;
      sessionRef.current = null;
      setSession(null);
      setStatus("expired");
    };

    electron?.ipcRenderer.on("photo-received", handlePhoto);
    electron?.ipcRenderer.on("camera-session-expired", handleExpired);

    return () => {
      mountedRef.current = false;
      mobileRequestRef.current += 1;
      usbRequestRef.current += 1;
      electron?.ipcRenderer.removeListener("photo-received", handlePhoto);
      electron?.ipcRenderer.removeListener("camera-session-expired", handleExpired);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      stopUsbStream();
      void stopMobileSession();
    };
  }, [stopMobileSession, stopUsbStream]);

  useEffect(() => {
    if (activeTab === "mobile") {
      stopUsbStream();
      void startMobileSession();
      return;
    }

    void stopMobileSession();
    void startUsbCamera();
  }, [activeTab, startMobileSession, startUsbCamera, stopMobileSession, stopUsbStream]);

  useEffect(() => {
    if (activeTab !== "usb" || !navigator.mediaDevices?.addEventListener) return undefined;
    const handleDeviceChange = async () => {
      const cameras = await refreshDevices().catch(() => []);
      if (selectedDeviceId && !cameras.some((device) => device.deviceId === selectedDeviceId)) {
        usbRequestRef.current += 1;
        stopUsbStream();
        setSelectedDeviceId(cameras[0]?.deviceId || "");
        setStatus("error");
        setError("The selected camera was disconnected. Select another camera.");
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, [activeTab, refreshDevices, selectedDeviceId, stopUsbStream]);

  // Rebind the live stream whenever the <video> element is (re)mounted, e.g.
  // after Retake — the element unmounts while a photo preview is shown, so the
  // remounted element needs srcObject reattached to display the live feed.
  useEffect(() => {
    if (activeTab === "usb" && !photo && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [activeTab, photo]);

  const switchTab = (tab) => {
    if (tab === activeTab) return;
    if (tab === "usb") mobileRequestRef.current += 1;
    if (tab === "mobile") usbRequestRef.current += 1;
    setError("");
    setPhoto(null);
    setActiveTab(tab);
  };

  const captureUsbPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatus("error");
      setError("The camera preview is not ready yet.");
      return;
    }
    try {
      setPhoto(drawSquare(video, video.videoWidth, video.videoHeight));
      setStatus("received");
    } catch (captureError) {
      setStatus("error");
      setError(captureError.message || "Could not capture the photo.");
    }
  };

  const retake = () => {
    setPhoto(null);
    setError("");
    if (activeTab === "mobile") {
      void startMobileSession(selectedIp);
    } else if (streamRef.current) {
      setStatus("waiting");
    } else {
      void startUsbCamera(selectedDeviceId);
    }
  };

  const save = () => {
    if (!photo) return;
    onCapture(photo);
    setStatus("saved");
    closeTimerRef.current = setTimeout(onClose, 300);
  };

  const close = () => {
    mobileRequestRef.current += 1;
    usbRequestRef.current += 1;
    stopUsbStream();
    void stopMobileSession();
    onClose();
  };

  const pairingJson = session
    ? JSON.stringify({
        sessionId: session.sessionId,
        token: session.token,
        url: session.url,
        expiresAt: session.expiresAt,
      })
    : "";
  // Stock phone camera apps open HTTP QR values but do not navigate raw JSON.
  // Carry the required JSON contract in the query while keeping the QR directly scannable.
  const qrValue = session
    ? `${session.url}?pairing=${encodeURIComponent(pairingJson)}`
    : "";

  const currentStatusText = activeTab === "usb"
    ? {
        starting: "Starting USB camera…",
        waiting: "Camera ready",
        received: "Photo captured",
        saved: "Saved",
        error: "USB camera unavailable",
      }[status] || statusText[status] || status
    : statusText[status] || status;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="camera-capture-title" className="text-lg font-black text-slate-900">Capture Member Photo</h2>
            <p className="mt-0.5 text-xs text-slate-500">Photos are saved as 480 × 480 JPEG images.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100" aria-label="Close camera capture">✕</button>
        </header>

        <div className="p-5">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => switchTab("mobile")} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${activeTab === "mobile" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>📱 Mobile Camera</button>
            <button type="button" onClick={() => switchTab("usb")} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${activeTab === "usb" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>📷 USB Camera</button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">{error}</div>
          )}

          {activeTab === "mobile" ? (
            <section className="text-center">
              {!photo && session && (
                <>
                  {ipCandidates.length > 1 && (
                    <label className="mx-auto mb-4 block max-w-sm text-left text-xs font-bold text-slate-600">
                      Network address
                      <select
                        value={selectedIp}
                        onChange={(event) => {
                          const ip = event.target.value;
                          setSelectedIp(ip);
                          void startMobileSession(ip);
                        }}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                      >
                        {ipCandidates.map((ip) => <option key={ip} value={ip}>{ip}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <QRCodeSVG value={qrValue} size={230} level="M" includeMargin title="SENOVA mobile camera pairing code" />
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-800">Scan this QR code with the phone camera.</p>
                  <p className="mt-1 text-xs text-slate-500">The phone and this computer must be on the same network. The code expires in 3 minutes.</p>
                  <p className="mx-auto mt-3 max-w-md break-all text-[10px] text-slate-400">Fallback URL: {session.url}</p>
                </>
              )}

              {!photo && status === "expired" && (
                <button type="button" onClick={() => startMobileSession(selectedIp)} className="mt-3 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Generate New QR Code</button>
              )}
              {!photo && status === "error" && (
                <button type="button" onClick={() => startMobileSession(selectedIp)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Try Again</button>
              )}
            </section>
          ) : (
            <section>
              {devices.length > 1 && (
                <label className="mb-4 block text-xs font-bold text-slate-600">
                  Camera device
                  <select
                    value={selectedDeviceId}
                    onChange={(event) => {
                      setSelectedDeviceId(event.target.value);
                      void startUsbCamera(event.target.value);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                  >
                    {devices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
              )}
              {!photo && (
                <div className="overflow-hidden rounded-2xl bg-slate-950 aspect-square">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover -scale-x-100" />
                </div>
              )}
            </section>
          )}

          {photo && (
            <div className="mx-auto max-w-md">
              <img src={photo} alt="Member photo preview" className="aspect-square w-full rounded-2xl border border-slate-200 object-cover shadow-sm" />
            </div>
          )}

          <div className={`mt-4 rounded-xl px-4 py-3 text-center text-sm font-bold ${status === "expired" || status === "error" ? "bg-rose-50 text-rose-700" : status === "received" || status === "saved" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`} aria-live="polite">
            {currentStatusText}
          </div>

          <footer className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            {!photo && activeTab === "usb" && status === "error" && (
              <button type="button" onClick={() => startUsbCamera(selectedDeviceId)} className="rounded-xl border border-blue-300 px-5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Retry Camera</button>
            )}
            {!photo && activeTab === "usb" && (
              <button type="button" onClick={captureUsbPhoto} disabled={!streamRef.current} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">Capture</button>
            )}
            {photo && (
              <>
                <button type="button" onClick={retake} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Retake</button>
                <button type="button" onClick={save} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Save Photo</button>
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
