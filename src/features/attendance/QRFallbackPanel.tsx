import { useState } from "react";
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
      ) : null}
    </section>
  );
}
