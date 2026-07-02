import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

type QRFallbackPanelProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onSimulate?: (code: string) => void;
};

export function QRFallbackPanel({ enabled, disabled, onToggle, onSimulate }: QRFallbackPanelProps) {
  return (
    <section className="rounded-lg border bg-surface p-4" aria-label="QR check-in simulation">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <QrCode className="h-4 w-4 text-brand-green-primary" aria-hidden="true" />
            QR check-in
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Development Simulation only. No real QR token or camera scanning is created.</p>
        </div>
        <Button type="button" variant={enabled ? "secondary" : "outline"} disabled={disabled} onClick={onToggle}>
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>
      {enabled ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSimulate?.("PLPASS-DEMO-1004")}>
            Simulate valid QR code
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSimulate?.("PLPASS-DEMO-INVALID")}>
            Simulate invalid QR code
          </Button>
        </div>
      ) : null}
    </section>
  );
}