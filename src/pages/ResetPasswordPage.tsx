import { FormEvent, useState } from "react";
import { z } from "zod";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters.")
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the password fields.");
      setSuccess(false);
      return;
    }
    setError(null);
    setSuccess(true);
  }

  return (
    <AuthLayout title="Reset password" description="Password recovery is not connected during development.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">New password</span>
          <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Confirm password</span>
          <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {success ? <p className="rounded-md bg-success-muted p-3 text-sm">Local validation passed. No password was stored or changed.</p> : null}
        <Button type="submit">Validate reset</Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.login}>Return to login</a>
        </Button>
      </form>
    </AuthLayout>
  );
}
