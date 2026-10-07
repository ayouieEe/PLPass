import { Children, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";
import { Loader2 } from "lucide-react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  hideCancel?: boolean;
  confirmDisabled?: boolean;
  confirmBusy?: boolean;
  confirmBusyLabel?: string;
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
  hideCancel = false,
  confirmDisabled = false,
  confirmBusy = false,
  confirmBusyLabel = "Working…",
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
      onClose={confirmBusy ? undefined : onCancel}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          {!hideCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={cancelDisabled}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button type="button" variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm} disabled={confirmDisabled || confirmBusy} aria-busy={confirmBusy}>
            {confirmBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />{confirmBusyLabel}</> : confirmLabel}
          </Button>
        </div>
      }
    >
      {hasChildren ? children : null}
    </ModalShell>
  );
}
