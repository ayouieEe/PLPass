import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

type QRFallbackPanelProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function QRFallbackPanel({ enabled, onToggle }: QRFallbackPanelProps) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
            QR fallback
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Secondary attendance option when NFC cannot be used.</p>
        </div>
        <Button type="button" variant={enabled ? "secondary" : "outline"} onClick={onToggle}>
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>
    </section>
  );
}
