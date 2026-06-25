import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StateMessage } from "@/components/feedback/StateMessage";

export function AccessDeniedPage() {
  return (
    <StateMessage
      title="Access denied"
      description="This placeholder route is not available for the current development role."
      action={
        <Button asChild>
          <Link to="/">Return home</Link>
        </Button>
      }
    />
  );
}
