import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

type QRFallbackPanelProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onSimulate?: (code: string) => void;
};

export function QRFallbackPanel({ enabled, disabled, onToggle, onSimulate }: QRFallbackPanelProps) {
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

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("This browser cannot access the camera. Please use a modern browser or switch to manual attendance.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((mediaStream) => {
        if (cancelled) return mediaStream.getTracks().forEach((track) => track.stop());

        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          void videoRef.current.play().catch(() => {
            setCameraMessage("Camera preview started. Point it at a QR code to continue.");
          });
        }

        setCameraMessage("Camera active. Point it at a QR code to continue.");

        const scanFrame = () => {
          if (!videoRef.current) return;

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          const video = videoRef.current;

          if (!context || video.readyState < 2) {
            timer = window.setTimeout(scanFrame, 250);
            return;
          }

          const width = video.videoWidth || 640;
          const height = video.videoHeight || 480;
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);

          const imageData = context.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });

          if (code?.data) {
            const value = code.data.trim();
            setCameraMessage("QR code detected.");
            onScanRef.current?.(value);
            setCameraOpen(false);
            return;
          }

          timer = window.setTimeout(scanFrame, 250);
        };

        scanFrame();
      })
      .catch(() => setCameraMessage("Camera access was unavailable. Paste or use a hardware scanner instead."));

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOpen, enabled]);

  return (
    <section className="space-y-4" aria-label="QR check-in">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/80 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-light text-brand-green-primary">
            <QrCode className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">QR check-in</p>
            <p className="text-xs text-muted-foreground">Use the camera to read student QR codes</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-black/95">
        {cameraOpen ? (
          <video ref={videoRef} autoPlay muted playsInline aria-label="QR scanner camera preview" className="aspect-video w-full bg-black object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-slate-300">
            Camera ready for QR scanning
          </div>
        )}
      </div>

      <Button 
        type="button" 
        className="w-full"
        variant={cameraOpen ? "destructive" : "default"}
        disabled={disabled}
        onClick={() => setCameraOpen((open) => !open)}
      >
        <QrCode className="h-4 w-4 mr-2" aria-hidden="true" />
        {cameraOpen ? "Stop scanning" : "Start QR scanning"}
      </Button>

      {cameraMessage ? <p className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-xs text-muted-foreground" role="status">{cameraMessage}</p> : null}
    </section>
  );
}
