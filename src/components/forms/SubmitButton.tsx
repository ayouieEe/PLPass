import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = Omit<ButtonProps, "type"> & {
  isSubmitting?: boolean;
};

export function SubmitButton({ isSubmitting, disabled, children, ...props }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={disabled || isSubmitting} {...props}>
      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}
