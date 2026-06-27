import { KeyboardEvent, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ReaderState } from "@/features/attendance/types";

type NFCReaderInputProps = {
  value: string;
  disabled?: boolean;
  mode?: "visible" | "compact";
  readerState?: ReaderState;
  showTestMenu?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onTestScan?: (code: string, outcome: "present" | "late" | "duplicate" | "blocked" | "invalid" | "not-enrolled" | "outside-window") => void;
};

const stateLabels: Record<ReaderState, string> = {
  ready: "Ready",
  processing: "Processing",
  success: "Success",
  error: "Error",
  disconnected: "Disconnected"
};

const testScans = [
  { label: "Valid Present scan", code: "PLPASS-DEMO-1002", outcome: "present" },
  { label: "Valid Late scan", code: "PLPASS-DEMO-1004", outcome: "late" },
  { label: "Duplicate scan", code: "PLPASS-DEMO-1002", outcome: "duplicate" },
  { label: "Blocked credential scan", code: "PLPASS-DEMO-BLOCKED", outcome: "blocked" },
  { label: "Invalid credential scan", code: "PLPASS-DEMO-INVALID", outcome: "invalid" },
  { label: "Student not enrolled scan", code: "PLPASS-DEMO-1001", outcome: "not-enrolled" },
  { label: "Outside attendance window scan", code: "PLPASS-DEMO-1004", outcome: "outside-window" }
] as const;

export function NFCReaderInput({ value, disabled, mode = "visible", readerState = "ready", showTestMenu = false, onChange, onSubmit, onTestScan }: NFCReaderInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && readerState !== "processing") {
      inputRef.current?.focus();
    }
  }, [disabled, readerState]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const submitted = value.trim();
      if (submitted && !disabled && readerState !== "processing") {
        onSubmit(submitted);
      }
    }
  }

  return (
    <section className="rounded-lg border bg-surface p-4" aria-label="Development Simulation NFC reader">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Development Simulation NFC reader</p>
          <p className="mt-1 text-xs text-muted-foreground">USB keyboard-mode readers type a safe demo code and send Enter.</p>
        </div>
        <span className="rounded-full border px-2 py-1 text-xs font-medium" aria-label={`Reader status ${stateLabels[readerState]}`}>
          {stateLabels[readerState]}
        </span>
      </div>
      <label className={mode === "compact" ? "sr-only" : "mt-3 block text-sm font-medium"} htmlFor="nfc-reader-input">
        Mock credential code
      </label>
      <input
        ref={inputRef}
        id="nfc-reader-input"
        className={mode === "compact" ? "mt-3 h-2 w-full rounded border border-dashed bg-background px-1 text-transparent caret-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring" : "plpass-field mt-2 h-12 w-full rounded-md border px-3 text-lg outline-none"}
        value={value}
        disabled={disabled || readerState === "processing" || readerState === "disconnected"}
        autoComplete="off"
        aria-describedby="nfc-reader-help"
        placeholder="Tap school ID sticker"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <p id="nfc-reader-help" className="mt-2 text-xs text-muted-foreground">Press Enter to submit. The field clears after each scan.</p>
      {showTestMenu ? (
        <div className="mt-4 rounded-md border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Development Simulation test scans</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {testScans.map((scan) => (
              <Button key={scan.label} type="button" variant="outline" size="sm" onClick={() => onTestScan?.(scan.code, scan.outcome)}>
                {scan.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
