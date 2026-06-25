import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <section className="plpass-modal-surface w-full max-w-2xl rounded-lg border p-5 shadow-lg" role="dialog" aria-modal="true">
        <div className="border-b pb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        <div className="py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit}>
            {submitLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
