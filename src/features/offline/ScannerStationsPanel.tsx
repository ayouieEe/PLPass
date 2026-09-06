import { useEffect, useState } from "react";
import { ChevronDown, QrCode, Radio, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { useQrCredentialDataUrl } from "@/hooks/useQrCredentialDataUrl";
import type { AttendanceCapturePhase, ScannerCertificateStatus, ScannerCoordinatorStatus } from "./types";

const inactive: ScannerCoordinatorStatus = { active: false, addresses: [], stations: [] };

function JoinCode({ label, value }: { label: string; value?: string }) {
  const dataUrl = useQrCredentialDataUrl(Boolean(value), value ?? "");
  if (!value) return null;
  return (
    <div className="rounded-xl border bg-background p-4 text-center">
      <p className="mb-3 text-sm font-semibold">{label}</p>
      {dataUrl ? <img src={dataUrl} alt={label} className="mx-auto h-40 w-40" /> : <QrCode className="mx-auto h-12 w-12 text-muted-foreground" />}
      <p className="mt-3 break-all text-xs text-muted-foreground">{value}</p>
    </div>
  );
}

export function ScannerStationsPanel({ eventId, sessionId, enabled, capturePhase }: { eventId: string; sessionId: string; enabled: boolean; capturePhase: AttendanceCapturePhase }) {
  const [status, setStatus] = useState<ScannerCoordinatorStatus>(inactive);
  const [certificateStatus, setCertificateStatus] = useState<ScannerCertificateStatus>({ configured: false });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const api = window.plpassDesktop;

  useEffect(() => {
    if (!api) return;
    void Promise.all([api.getScannerStations(), api.getScannerCertificateStatus()])
      .then(([scannerStatus, certificate]) => { setStatus(scannerStatus); setCertificateStatus(certificate); })
      .catch(() => setStatus(inactive));
    return api.onScannerStatus(setStatus);
  }, [api]);

  async function start() {
    if (!api) return;
    setBusy(true);
    try {
      const scannerStatus = await api.startScannerStations(eventId, sessionId, capturePhase);
      setStatus(scannerStatus);
      setCertificateStatus({ configured: Boolean(scannerStatus.certificateFingerprint), fingerprint: scannerStatus.certificateFingerprint, expiresAt: scannerStatus.certificateExpiresAt });
      toast.success("Scanner stations are ready. Start the laptop hotspot, then connect each phone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scanner stations could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!api) return;
    setBusy(true);
    try {
      await api.stopScannerStations();
      setStatus(inactive);
      toast.success("Scanner stations were closed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeStation(id: string) {
    if (api) await api.removeScannerStation(id);
  }

  async function replaceCertificate() {
    if (!api) return;
    setBusy(true);
    try {
      setCertificateStatus(await api.replaceScannerCertificate());
      setStatus(inactive);
      setReplaceOpen(false);
      toast.success("Trusted certificate replaced. Phones must install the new certificate before they scan again.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The trusted certificate could not be replaced.");
    } finally {
      setBusy(false);
    }
  }

  if (!api) return <section className="rounded-2xl border bg-surface p-4"><h2 className="font-semibold">Phone scanners</h2><p className="mt-1 text-sm text-muted-foreground">Open PLPass in the desktop app to use phone scanner stations.</p></section>;

  const phaseLabel = capturePhase === "time_out" ? "Recording Time Out" : "Recording Time In";

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm" aria-label="Phone scanner stations">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Radio className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block font-semibold">Phone scanners</span><span className="mt-0.5 block text-sm text-muted-foreground">{status.stations.length}/5 connected · {phaseLabel}</span></span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {expanded ? <div className="border-t border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">Use up to five phones as QR scanners. The laptop remains the only attendance recorder.</p>
          {status.active ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void stop()}>Close scanner stations</Button> : <Button type="button" size="sm" disabled={!enabled || busy} onClick={() => void start()}>{busy ? "Starting…" : "Start scanner stations"}</Button>}
        </div>
        {!enabled ? <p className="mt-3 text-sm text-muted-foreground">Prepare this event for offline use before starting phone scanners.</p> : null}
        {!status.active && certificateStatus.configured ? <p className="mt-3 text-sm text-muted-foreground">Phones that already trust this laptop’s certificate are ready until {certificateStatus.expiresAt ? new Date(certificateStatus.expiresAt).toLocaleDateString() : "it expires"}.</p> : null}
        {status.active ? <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"><p className="font-semibold">Phone scanners are {phaseLabel.toLowerCase()}</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Connect a phone</p><p className="mt-1">Turn on the laptop hotspot. Each phone joins it, then scans this same QR code.</p></div>
          <JoinCode label="Join scanner stations — scan on up to five phones" value={status.joinUrl} />
          <div className="rounded-xl border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Trusted scanner certificate</p><p className="mt-1 text-xs text-muted-foreground">Fingerprint: {status.certificateFingerprint}</p>{status.certificateExpiresAt ? <p className="mt-1 text-xs text-muted-foreground">Expires: {new Date(status.certificateExpiresAt).toLocaleDateString()}</p> : null}</div><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setReplaceOpen(true)}>Replace trusted certificate</Button></div></div>
          <div className="rounded-xl border bg-background p-3"><p className="font-medium">Laptop addresses</p>{status.addresses.map((address) => <p key={address} className="mt-1 break-all font-mono text-xs text-muted-foreground">{address}</p>)}</div>
          <div><p className="mb-2 flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Connected phones</p>{status.stations.length ? <ul className="space-y-2">{status.stations.map((station) => <li key={station.id} className="flex items-center justify-between rounded-xl border bg-background p-2 text-sm"><span>{station.name}<span className="ml-2 text-muted-foreground">Last activity: {new Date(station.lastSeenAt).toLocaleTimeString()}</span></span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${station.name}`} onClick={() => void removeStation(station.id)}><Trash2 className="h-4 w-4" /></Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No phones connected yet.</p>}</div>
        </div> : null}
      </div> : null}
      <ConfirmModal open={replaceOpen} title="Replace trusted scanner certificate" description="This closes scanner stations now. Every phone must install and trust the new PLPass Scanner certificate before it can scan again." confirmLabel="Replace certificate" tone="danger" onCancel={() => setReplaceOpen(false)} onConfirm={() => void replaceCertificate()} />
    </section>
  );
}
