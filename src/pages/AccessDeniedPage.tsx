import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StateMessage } from "@/components/feedback/StateMessage";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getAuthorizedHomePath } from "@/lib/utils/auth";

export function AccessDeniedPage() {
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  return (
    <StateMessage
      title="Access denied"
      description="Your signed-in development role does not have permission to open this route."
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={session ? getAuthorizedHomePath(session.role) : APP_ROUTES.login}>Return to authorized area</Link>
          </Button>
          <Button type="button" variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      }
    />
  );
}
