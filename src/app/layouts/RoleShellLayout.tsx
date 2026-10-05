import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/app/layouts/DashboardLayout";
import { HeaderProvider } from "@/app/providers/HeaderProvider";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useUser } from "@/hooks/useRepositoryQueries";
import { ActiveSessionOverlay } from "@/features/attendance/ActiveSessionOverlay";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function RoleShellLayout() {
  const { session, isOfflineMode } = useDevelopmentSession();
  const location = useLocation();
  const userQuery = useUser(
    session?.userId,
    session && !isOfflineMode ? { actorUserId: session.userId, actorRole: session.role } : undefined
  );
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    const storedAvatar = userQuery.data?.avatarUrl;
    if (!storedAvatar?.startsWith("profile-avatars:")) {
      setAvatarUrl(storedAvatar ?? "");
      return;
    }

    let cancelled = false;
    void getSupabaseBrowserClient()
      .storage.from("profile-avatars")
      .createSignedUrl(storedAvatar.slice("profile-avatars:".length), 3600)
      .then(({ data, error }) => {
        if (!cancelled) setAvatarUrl(error ? "" : data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [userQuery.data?.avatarUrl]);

  if (!session) {
    return (
      <div className="min-h-screen bg-background p-6">
        <LoadingState label="Preparing workspace" />
      </div>
    );
  }

  // The first-login legal review is part of the authenticated flow, but it
  // must be shown before the student workspace chrome becomes available.
  if (location.pathname === APP_ROUTES.studentLegalReview) {
    return <Outlet />;
  }

  return (
    <HeaderProvider>
      <DashboardLayout role={session.role} userLabel={session.displayName} avatarUrl={avatarUrl || undefined}>
        <Outlet />
      </DashboardLayout>
      {!isOfflineMode ? <ActiveSessionOverlay /> : null}
    </HeaderProvider>
  );
}

