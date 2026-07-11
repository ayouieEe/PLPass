import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

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
    <ModalShell
      open={open}
      title={title}
      description={description}
      size="sm"
      onClose={onCancel}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
    </ModalShell>
  );
}
