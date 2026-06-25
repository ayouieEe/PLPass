import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  children,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <section className="plpass-modal-surface w-full max-w-md rounded-lg border p-5 shadow-lg" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
