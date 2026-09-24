import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useOrganizerBranding, useOrganizerProfiles } from "@/hooks/useRepositoryQueries";

export const DEFAULT_BRANDING = {
  plpLogoUrl: "/plp-logo.png",
  collegeName: "Pamantasan ng Lungsod ng Pasig",
  collegeLogoUrl: undefined,
  systemName: "PLPass"
} as const;

export function useBranding() {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const organizerContext = session?.role === "organizer" ? context : undefined;
  const profiles = useOrganizerProfiles({ pageIndex: 0, pageSize: 1 }, organizerContext);
  const organizerId = session?.role === "organizer" ? profiles.data?.items[0]?.id : undefined;
  const branding = useOrganizerBranding(organizerId, organizerContext);
  return {
    ...DEFAULT_BRANDING,
    collegeName: branding.data?.collegeName ?? DEFAULT_BRANDING.collegeName,
    collegeLogoUrl: branding.data?.collegeLogoUrl,
    isLoading: session?.role === "organizer" && (profiles.isLoading || branding.isLoading)
  };
}
