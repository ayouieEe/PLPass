import { BrowserQRCodeReader } from "@zxing/browser";
import "./scanner.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Scanner page could not start.");
const joinToken = new URLSearchParams(location.search).get("join");
let stationToken = "";
let controls: Awaited<ReturnType<BrowserQRCodeReader["decodeFromVideoDevice"]>> | null = null;
let busy = false;
let socket: WebSocket | null = null;
let startingCamera = false;
const recentCredentials = new Map<string, number>();
let capturePhase: "time_in" | "time_out" = "time_in";

function show(html: string) { root.innerHTML = html; }
function safe(text: string) { return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character); }
function phaseLabel() { return capturePhase === "time_out" ? "Time Out" : "Time In"; }
function renderPhase() { const label = document.querySelector<HTMLElement>("#phase"); if (label) label.textContent = `Recording ${phaseLabel()}`; const result = document.querySelector<HTMLParagraphElement>("#result"); if (result && controls && !busy) { result.className = "scan-status"; result.textContent = `Camera is ready. Scan a student QR to record ${phaseLabel()}.`; } }

async function startScan() {
  const video = document.querySelector<HTMLVideoElement>("#camera"); const result = document.querySelector<HTMLParagraphElement>("#result"); const button = document.querySelector<HTMLButtonElement>("#start");
  if (!video || !result || !stationToken || controls || startingCamera) return;
  startingCamera = true;
  if (button) { button.disabled = true; button.textContent = "Starting camera…"; }
  result.className = "scan-status"; result.textContent = "Opening camera…";
  const reader = new BrowserQRCodeReader();
  try {
    controls = await reader.decodeFromVideoDevice(undefined, video, async (qr) => {
      if (!qr || busy) return;
      const credential = qr.getText();
      const now = Date.now();
      if ((recentCredentials.get(credential) ?? 0) > now) return;
      recentCredentials.set(credential, now + 5_000);
      busy = true; result.className = "scan-status"; result.textContent = `Recording ${phaseLabel()} with the laptop…`;
      try {
        const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${stationToken}` }, body: JSON.stringify({ credentialCode: credential, scanAttemptId: crypto.randomUUID() }) });
        const body = await response.json() as { accepted?: boolean; action?: string; message?: string; studentName?: string; studentNumber?: string; error?: string };
        const name = body.studentName ? `${body.studentName}${body.studentNumber ? ` (${body.studentNumber})` : ""}: ` : "";
        result.className = body.accepted ? "scan-status success" : "scan-status error"; result.textContent = `${name}${body.message ?? body.error ?? "Scan could not be confirmed."}`;
      } catch { result.className = "scan-status error"; result.textContent = "Disconnected from the attendance laptop. Reconnect to its hotspot before scanning again."; controls?.stop(); }
      window.setTimeout(() => { busy = false; }, 750);
    });
    if (button) button.remove();
    result.className = "scan-status"; result.textContent = `Camera is ready. Scan a student QR to record ${phaseLabel()}.`;
  } catch {
    result.className = "scan-status error"; result.textContent = "Camera access was not granted. Confirm the certificate is trusted, then allow camera access in this browser.";
    if (button) { button.disabled = false; button.textContent = "Try camera again"; }
  } finally { startingCamera = false; }
}

async function join() {
  if (!joinToken) { show(`<section><h1>PLPass Scanner Station</h1><p>First join the organizer laptop’s Wi-Fi hotspot. Then use the setup link supplied by the organizer to trust its temporary certificate, and scan the current station invitation QR.</p><a class="button" href="/certificate.cer">Download temporary certificate</a><p class="small">After the event, remove the PLPass temporary certificate from this phone.</p></section>`); return; }
  show(`<main class="scanner-shell"><section class="scanner-card loading-card"><div class="brand-mark" aria-hidden="true">⌁</div><p class="eyebrow">PLPass</p><h1>Connecting scanner</h1><p class="intro">Securely connecting to the attendance laptop…</p><div class="loading-line"><span></span></div></section></main>`);
  try {
    const response = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ joinToken }) });
    const body = await response.json() as { station?: { name: string }; stationToken?: string; capturePhase?: "time_in" | "time_out"; error?: string };
    if (!response.ok || !body.stationToken) throw new Error(body.error ?? "This invitation is no longer valid.");
    stationToken = body.stationToken;
    capturePhase = body.capturePhase ?? "time_in";
    show(`<main class="scanner-shell"><section class="scanner-card"><header class="scanner-header"><div class="brand"><span class="brand-mark" aria-hidden="true">⌁</span><span>PLPass</span></div><span class="connection"><i></i> Connected</span></header><div class="scanner-title"><p class="station-name">${safe(body.station?.name ?? "Scanner station")}</p><h1>Student attendance</h1><p id="phase" class="phase-badge">Recording ${phaseLabel()}</p></div><div class="camera-frame"><video id="camera" autoplay muted playsinline></video><div class="scan-guide" aria-hidden="true"><span></span><span></span><span></span><span></span></div><p class="camera-hint">Align the student QR within the frame</p></div><p id="result" class="scan-status" role="status">Start the camera to scan student ${phaseLabel()}.</p><button id="start" class="start-button"><span aria-hidden="true">▣</span> Start camera</button><footer class="scanner-footer"><span class="lock-icon" aria-hidden="true">⌑</span> Confirmed by the organizer laptop</footer></section></main>`);
    document.querySelector<HTMLButtonElement>("#start")?.addEventListener("click", () => void startScan());
    socket = new WebSocket(`wss://${location.host}/ws?token=${encodeURIComponent(stationToken)}`);
    socket.addEventListener("message", (event) => { try { const update = JSON.parse(String(event.data)) as { type?: string; status?: { capturePhase?: "time_in" | "time_out" } }; if (update.type === "status" && update.status?.capturePhase) { capturePhase = update.status.capturePhase; renderPhase(); } } catch { /* Ignore malformed status updates. */ } });
    socket.addEventListener("close", () => { controls?.stop(); const result = document.querySelector<HTMLParagraphElement>("#result"); if (result) { result.className = "scan-status error"; result.textContent = "Disconnected from the attendance laptop. Reconnect to its hotspot and ask the organizer for a new invitation."; } });
  } catch (error) { show(`<main class="scanner-shell"><section class="scanner-card error-card"><div class="brand-mark" aria-hidden="true">!</div><p class="eyebrow">Scanner unavailable</p><h1>Could not connect</h1><p class="intro">${safe(error instanceof Error ? error.message : "Ask the organizer for a new scanner invitation.")}</p></section></main>`); }
}
window.addEventListener("pagehide", () => { controls?.stop(); socket?.close(); });
void join();
