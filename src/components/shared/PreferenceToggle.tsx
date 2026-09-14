type PreferenceToggleProps = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function PreferenceToggle({ label, checked, disabled = false, onChange }: PreferenceToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}
