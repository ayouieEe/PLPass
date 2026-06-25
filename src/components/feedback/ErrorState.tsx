import { AlertTriangle } from "lucide-react";

type ErrorStateProps = {
  title: string;
  message?: string;
};

export function ErrorState({ title, message }: ErrorStateProps) {
  return (
    <div className="plpass-error-state rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          {message ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
