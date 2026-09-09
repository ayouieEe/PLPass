import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changePassword, passwordChangeErrorMessage, passwordRequirementsMessage, passwordSchema } from "@/lib/auth/passwords";

type ChangePasswordFormProps = {
  email: string;
  onChanged?: () => Promise<void> | void;
};

export function ChangePasswordForm({ email, onChanged }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = passwordSchema.safeParse({ currentPassword, password, confirmPassword });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your password fields.");
      return;
    }
    if (!email.trim()) {
      toast.error("This account does not have an email address. Contact PLPass support.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(email.trim(), currentPassword, password);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      toast.success("Password changed. Other signed-in devices have been signed out.");
      await onChanged?.();
    } catch (error) {
      toast.error(passwordChangeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">Use at least 8 characters. Changing your password signs out other devices.</p>
      <div className="space-y-1.5">
        <label htmlFor="current-password" className="text-xs font-semibold text-foreground">Current password</label>
        <input id="current-password" autoComplete="current-password" type="password" className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-xs font-semibold text-foreground">New password</label>
        <input id="new-password" autoComplete="new-password" type="password" className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none" value={password} onChange={(event) => setPassword(event.target.value)} />
        <p className="text-xs text-muted-foreground">{passwordRequirementsMessage}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm-new-password" className="text-xs font-semibold text-foreground">Confirm new password</label>
        <input id="confirm-new-password" autoComplete="new-password" type="password" className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
      </div>
      <Button type="submit" disabled={submitting} className="mt-2 px-6">{submitting ? "Updating..." : "Update password"}</Button>
    </form>
  );
}
