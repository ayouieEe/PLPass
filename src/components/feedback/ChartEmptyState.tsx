type ChartEmptyStateProps = {
  message?: string;
};

export function ChartEmptyState({ message = "No attendance data is available yet." }: ChartEmptyStateProps) {
  return (
    <div className="flex h-full min-h-52 items-center justify-center rounded-md border border-dashed bg-surface-muted px-4 text-center">
      <p className="max-w-sm text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
