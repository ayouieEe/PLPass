import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

type QRFallbackPanelProps = {
  disabled?: boolean;
  onScan?: (code: string) => void;
};
const scannerIdleSubmissionDelayMs = 1_000;
const duplicateQrSuppressionMs = 5_000;

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches("input, textarea, select")
  );
}

export function QRFallbackPanel({ disabled, onScan }: QRFallbackPanelProps) {
  const [qrCode, setQrCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onScanRef = useRef(onScan);
  const scannerBufferRef = useRef("");
  const scannerFlushTimerRef = useRef<number | undefined>(undefined);
  const recentScansRef = useRef(new Map<string, number>());

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const resetScannerBuffer = () => {
      if (scannerFlushTimerRef.current !== undefined) {
        window.clearTimeout(scannerFlushTimerRef.current);
        scannerFlushTimerRef.current = undefined;
      }
      scannerBufferRef.current = "";
    };

    const submitBufferedScan = () => {
      const value = scannerBufferRef.current.trim();
      if (value.length < 3) {
        resetScannerBuffer();
        return;
      }
      resetScannerBuffer();
      setQrCode(value);
      const scanKey = value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const now = Date.now();
      const previousScanAt = recentScansRef.current.get(scanKey);
      if (previousScanAt !== undefined && now - previousScanAt < duplicateQrSuppressionMs) return;
      recentScansRef.current.set(scanKey, now);
      for (const [key, timestamp] of recentScansRef.current) {
        if (now - timestamp >= duplicateQrSuppressionMs) recentScansRef.current.delete(key);
      }
      setCameraMessage("QR code received from the connected scanner.");
      onScanRef.current?.(value);
    };

    const handleScannerKeyDown = (event: KeyboardEvent) => {
      if (disabled || isEditableTarget(event.target)) {
        resetScannerBuffer();
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (scannerBufferRef.current.trim().length >= 3) {
          event.preventDefault();
          submitBufferedScan();
        } else {
          resetScannerBuffer();
        }
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;

      scannerBufferRef.current += event.key;
      if (scannerFlushTimerRef.current !== undefined) window.clearTimeout(scannerFlushTimerRef.current);
      scannerFlushTimerRef.current = window.setTimeout(submitBufferedScan, scannerIdleSubmissionDelayMs);
    };

    window.addEventListener("keydown", handleScannerKeyDown, true);
    return () => {
      resetScannerBuffer();
      window.removeEventListener("keydown", handleScannerKeyDown, true);
    };
  }, [disabled]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const detectorApi = window as typeof window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } };
    const BarcodeDetector = detectorApi.BarcodeDetector;
    if (!BarcodeDetector) {
      setCameraMessage("Camera QR detection is not supported by this browser. Use the connected hardware scanner instead.");
      setCameraOpen(false);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      focusMode: { ideal: "continuous" }
    } as MediaTrackConstraints, audio: false })
      .then((mediaStream) => {
        if (cancelled) return mediaStream.getTracks().forEach((track) => track.stop());
        stream = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            const scanKey = value.toLowerCase().replace(/[^a-z0-9]/g, "");
            const now = Date.now();
            const previousScanAt = recentScansRef.current.get(scanKey);
            if (previousScanAt !== undefined && now - previousScanAt < duplicateQrSuppressionMs) return;
            recentScansRef.current.set(scanKey, now);
            setQrCode(value);
            setCameraMessage("QR code detected.");
            onScanRef.current?.(value);
            setCameraOpen(false);
          }
        }, 500);
      })
      .catch(() => setCameraMessage("Camera access was unavailable. Use the connected hardware scanner instead."));
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOpen]);

  return (
    <section className="rounded-lg border bg-surface p-4" aria-label="QR check-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <QrCode className="h-4 w-4 text-brand-green-primary" aria-hidden="true" />
            QR check-in
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Ready for the connected barcode scanner. Scan the student QR code; no field selection is required.</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setCameraOpen((open) => !open)}>
              {cameraOpen ? "Stop camera" : "Scan with camera"}
            </Button>
          </div>
          {cameraOpen ? <video ref={videoRef} autoPlay muted playsInline aria-label="QR scanner camera preview" className="aspect-video max-h-80 w-full rounded-lg bg-black object-cover" /> : null}
          {cameraMessage ? <p className="text-sm text-muted-foreground" role="status">{cameraMessage}</p> : null}
        {qrCode ? <p className="text-sm text-muted-foreground" role="status">Last scanner value received: {qrCode}</p> : null}
      </div>
    </section>
  );
}
