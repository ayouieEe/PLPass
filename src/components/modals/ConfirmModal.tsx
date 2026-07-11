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
  cancelLabel,
  tone = "default",
  children,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  return (
    <ModalShell
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children}
    </ModalShell>
  );
}
