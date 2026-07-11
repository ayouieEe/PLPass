import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type ModalShellSize = "sm" | "md" | "lg" | "xl";

type ModalShellProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalShellSize;
  onClose?: () => void;
};

const sizeClass: Record<ModalShellSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl"
};

export function ModalShell({ open, title, description, children, footer, size = "md", onClose }: ModalShellProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/45 p-4 backdrop-blur-sm">
      <section
        className={cn(
          "plpass-modal-surface relative max-h-[90vh] w-full overflow-hidden rounded-2xl border shadow-2xl",
          sizeClass[size]
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/80 via-primary/30 to-transparent" />
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 flex-shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close modal"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="max-h-[calc(90vh-9rem)] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t bg-surface-muted/40 p-5">{footer}</div> : null}
      </section>
    </div>
  );
}
