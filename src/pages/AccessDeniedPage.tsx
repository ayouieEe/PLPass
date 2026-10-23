import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { StateMessage } from "@/components/feedback/StateMessage";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getAuthorizedHomePath } from "@/lib/utils/auth";

export function AccessDeniedPage() {
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      queryClient.clear();
      setLogoutConfirmOpen(false);
      navigate(APP_ROUTES.login, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out safely.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <StateMessage
      title="Access denied"
      description="Your signed-in development role does not have permission to open this route."
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={session ? getAuthorizedHomePath(session.role) : APP_ROUTES.login}>Return to authorized area</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => setLogoutConfirmOpen(true)}>
            Logout
          </Button>
        </div>
      }
      />
      <ConfirmModal
      open={logoutConfirmOpen}
      title="Log out of PLPass?"
      description="You will need to sign in again to access your workspace."
      confirmLabel="Log out"
      tone="danger"
      confirmBusy={loggingOut}
      confirmBusyLabel="Logging out…"
      cancelDisabled={loggingOut}
      onConfirm={() => void handleLogout()}
      onCancel={() => setLogoutConfirmOpen(false)}
    />
    </>
  );
}
