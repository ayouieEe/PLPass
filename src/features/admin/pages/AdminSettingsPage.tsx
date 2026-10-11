import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { AdminSystemSettingsPage } from "@/features/organizer/pages/OrganizerSettingsPage";

export function AdminSettingsPage({ initialTab }: { initialTab?: "overview" | "academic" | "events" | "attendance" | "access" | "legal" } = {}) {
  const { session } = useDevelopmentSession();

  if (session?.role !== "admin") {
    return <AccessDeniedPage />;
  }

  return <AdminSystemSettingsPage initialTab={initialTab} />;
}

export function AdminCatalogsPage() {
  return <AdminSettingsPage initialTab="academic" />;
}
