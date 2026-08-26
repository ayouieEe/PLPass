import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

type QRFallbackPanelProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onSimulate?: (code: string) => void;
};

export function QRFallbackPanel({ enabled, disabled, onToggle, onSimulate }: QRFallbackPanelProps) {
  const [qrCode, setQrCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onScanRef = useRef(onSimulate);

  useEffect(() => {
    onScanRef.current = onSimulate;
  }, [onSimulate]);

  useEffect(() => {
    if (!enabled || !cameraOpen) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const detectorApi = window as typeof window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } };
    if (!detectorApi.BarcodeDetector) {
      setCameraMessage("Camera QR detection is not supported by this browser. Paste or scan the code into the field below.");
      setCameraOpen(false);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((mediaStream) => {
        if (cancelled) return mediaStream.getTracks().forEach((track) => track.stop());
        stream = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
        const detector = new detectorApi.BarcodeDetector!({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            setQrCode(value);
            setCameraMessage("QR code detected.");
            onScanRef.current?.(value);
            setCameraOpen(false);
          }
        }, 500);
      })
      .catch(() => setCameraMessage("Camera access was unavailable. Paste or use a hardware scanner instead."));
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOpen, enabled]);

  return (
    <section className="rounded-lg border bg-surface p-4" aria-label="QR check-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <QrCode className="h-4 w-4 text-brand-green-primary" aria-hidden="true" />
            QR check-in
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Enter or paste the student QR code shown in their Attendance Methods page.</p>
        </div>
        <Button type="button" variant={enabled ? "secondary" : "outline"} disabled={disabled} onClick={onToggle}>
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>
      {enabled ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setCameraOpen((open) => !open)}>
              {cameraOpen ? "Stop camera" : "Scan with camera"}
            </Button>
          </div>
          {cameraOpen ? <video ref={videoRef} autoPlay muted playsInline aria-label="QR scanner camera preview" className="aspect-video max-h-80 w-full rounded-lg bg-black object-cover" /> : null}
          {cameraMessage ? <p className="text-sm text-muted-foreground" role="status">{cameraMessage}</p> : null}
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (qrCode.trim()) {
              onSimulate?.(qrCode.trim());
            }
          }}
        >
          <input
            value={qrCode}
            onChange={(event) => setQrCode(event.target.value)}
            className="plpass-field min-h-11 flex-1 rounded-xl border px-3 text-sm"
            placeholder="PLPASS-QR:..."
            disabled={disabled}
          />
          <Button type="submit" size="sm" disabled={disabled || !qrCode.trim()}>
            Record scan
          </Button>
        </form>
        </div>
      ) : null}
    </section>
  );
}
