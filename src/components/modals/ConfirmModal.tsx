import { Children, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
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
  confirmDisabled = false,
  cancelDisabled = false,
  children,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const hasChildren = Children.toArray(children).length > 0;

  return (
    <ModalShell
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={cancelDisabled}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {hasChildren ? children : null}
    </ModalShell>
  );
}
