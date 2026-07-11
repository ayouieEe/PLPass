import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

type FormModalProps = {
  open: boolean;
  title: string;
  description?: string;
  submitLabel?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
};

export function FormModal({ open, title, description, submitLabel = "Save", children, onClose, onSubmit }: FormModalProps) {
  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      title={title}
      description={description}
      size="lg"
      onClose={onClose}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit}>
            {submitLabel}
          </Button>
        </>
      )}
    >
      {children}
    </ModalShell>
  );
}
