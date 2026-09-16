import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { AdminSystemSettingsPage } from "@/features/organizer/pages/OrganizerSettingsPage";

export function AdminSettingsPage({ initialTab }: { initialTab?: "overview" | "academic" | "events" | "attendance" | "notifications" | "access" } = {}) {
  const { session } = useDevelopmentSession();

  if (session?.role !== "admin") {
    return <AccessDeniedPage />;
  }

  return <AdminSystemSettingsPage initialTab={initialTab} />;
}

export function AdminCatalogsPage() {
  return <AdminSettingsPage initialTab="academic" />;
}
