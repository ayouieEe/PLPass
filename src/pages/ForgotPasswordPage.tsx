import { FormEvent, useState } from "react";
import { z } from "zod";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { useDevelopmentAccounts } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address.")
});

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accounts = useDevelopmentAccounts();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      setMessage(null);
      return;
    }

    const isKnownEmail = accounts.data?.some((account) => account.email === parsed.data.email) ?? false;
    setError(null);
    setMessage(
      isKnownEmail
        ? "Development reset instructions are ready for this fixture account."
        : "If that email exists in PLPass, development reset instructions would be shown."
    );
  }

  return (
    <AuthLayout title="Forgot password" description="Password recovery is simulated during development.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="rounded-md bg-info-muted p-3 text-sm text-foreground">{message}</p> : null}
        <Button type="submit">Continue</Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.login}>Return to login</a>
        </Button>
      </form>
    </AuthLayout>
  );
}
