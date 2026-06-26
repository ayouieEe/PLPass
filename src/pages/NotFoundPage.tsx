import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StateMessage } from "@/components/feedback/StateMessage";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getAuthorizedHomePath } from "@/lib/utils/auth";

export function NotFoundPage() {
  const { session } = useDevelopmentSession();

  return (
    <StateMessage
      title="Page not found"
      description="The route does not exist in the current PLPass frontend."
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={session ? getAuthorizedHomePath(session.role) : "/"}>Return to authorized area</Link>
          </Button>
          {!session ? (
            <Button asChild variant="outline">
              <Link to={APP_ROUTES.login}>Return to login</Link>
            </Button>
          ) : null}
        </div>
      }
    />
  );
}
