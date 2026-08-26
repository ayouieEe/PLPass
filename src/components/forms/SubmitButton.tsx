import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = Omit<ButtonProps, "type"> & {
  isSubmitting?: boolean;
  submittingLabel?: string;
};

export function SubmitButton({ isSubmitting, submittingLabel = "Submitting…", disabled, children, ...props }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={disabled || isSubmitting} aria-busy={isSubmitting || undefined} {...props}>
      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {isSubmitting ? submittingLabel : children}
    </Button>
  );
}
