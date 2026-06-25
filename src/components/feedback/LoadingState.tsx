type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading" }: LoadingStateProps) {
  return (
    <div className="plpass-loading-state flex items-center gap-3 rounded-lg border p-4">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
