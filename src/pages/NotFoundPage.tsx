import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StateMessage } from "@/components/feedback/StateMessage";

export function NotFoundPage() {
  return (
    <StateMessage
      title="Page not found"
      description="The route exists outside the current Phase 0 frontend foundation."
      action={
        <Button asChild variant="outline">
          <Link to="/">Go to home</Link>
        </Button>
      }
    />
  );
}
