import { Camera, LogOut, ShieldAlert, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useOrganizerProfiles,
  useStudents,
  useUser
} from "@/hooks/useRepositoryQueries";
import { toast } from "sonner";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getErrorMessage } from "@/lib/utils/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Program, Department } from "@/types/domain";

type ProfileFieldProps = {
  label: string;
  value?: string | number | null;
};

function getNameById<T extends Program | Department>(items: T[] | undefined, id: string | undefined) {
  return items?.find((item) => item.id === id)?.name;
}

function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <div className="rounded-md border bg-surface p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value ?? "Not available"}</dd>
    </div>
  );
}

export function ProfilePage() {
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const userQuery = useUser(session?.userId, context);
  const studentQuery = useStudents({ pageSize: 1 }, context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, context);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const student = studentQuery.data?.items[0];

  useEffect(() => {
    const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(session?.displayName || session?.role || "User")}`;
    const storedAvatar = userQuery.data?.avatarUrl;
    if (!storedAvatar?.startsWith("profile-avatars:")) {
      setAvatarUrl(storedAvatar ?? fallback);
      return;
    }

    let cancelled = false;
    const objectPath = storedAvatar.slice("profile-avatars:".length);
    void getSupabaseBrowserClient()
      .storage.from("profile-avatars")
      .createSignedUrl(objectPath, 3600)
      .then(({ data, error }) => {
        if (!cancelled) setAvatarUrl(error ? fallback : data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.displayName, session?.role, userQuery.data?.avatarUrl]);

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  if (!session) {
    return <ErrorState title="No active session" message="Sign in with a development account to view a profile." />;
  }

  const isLoading =
    userQuery.isLoading ||
    catalog.departments.isLoading ||
    catalog.programs.isLoading ||
    (session.role === "student" && studentQuery.isLoading) ||
    session.role === "organizer" && organizerQuery.isLoading;

  if (isLoading) {
    return <LoadingState label="Loading profile" />;
  }

  if (userQuery.isError) {
    return <ErrorState title="Unable to load profile" message="The profile repository returned an error." />;
  }

  if (!userQuery.data) {
    return <EmptyState title="Profile not found" description="No fixture profile exists for this development account." />;
  }

  const user = userQuery.data;
  const departments = catalog.departments.data?.items;
  const programs = catalog.programs.data?.items;
  const fields: ProfileFieldProps[] = [{ label: "Name", value: user.displayName }, { label: "Email", value: user.email }];

  if (session.role === "student") {
    fields.push(
      { label: "Student number", value: student?.studentNumber },
      { label: "Department", value: getNameById(departments, student?.departmentId) },
      { label: "Program", value: getNameById(programs, student?.programId) },
      { label: "Year level", value: student?.yearLevel },
      { label: "Section", value: student?.section },
      { label: "Student status", value: student?.status }
    );
  }

  if (session.role === "organizer") {
    const profile = organizerQuery.data?.items[0];
    fields.push(
      { label: "Employee ID", value: profile?.employeeNumber },
      { label: "Department", value: getNameById(departments, profile?.departmentId) },
      { label: "Position", value: profile?.position },
      { label: "Employment status", value: profile?.employmentStatus },
    );
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || isUploadingAvatar) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a JPG, PNG, or WebP profile picture.");
      input.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile pictures must be 2 MB or smaller.");
      input.value = "";
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const client = getSupabaseBrowserClient();
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const objectPath = `${session?.userId ?? "unknown"}/avatar.${extension}`;
      const { error: uploadError } = await client.storage
        .from("profile-avatars")
        .upload(objectPath, file, { contentType: file.type, cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;

      const { data: signedUrlData, error: signedUrlError } = await client.storage
        .from("profile-avatars")
        .createSignedUrl(objectPath, 3600);
      if (signedUrlError) throw signedUrlError;

      const { error: profileError } = await client
        .from("profiles")
        .update({ profile_picture: `profile-avatars:${objectPath}`, updated_at: new Date().toISOString() })
        .eq("id", session?.userId ?? "");
      if (profileError) throw profileError;

      setAvatarUrl(signedUrlData.signedUrl);
      await queryClient.invalidateQueries({ queryKey: ["user", session?.userId] });
      toast.success("Profile picture updated successfully.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUploadingAvatar(false);
      input.value = "";
    }
  }

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description={`Manage your ${session.role} details and account security.`}
        actions={
          <Button type="button" variant="outline" onClick={handleLogout} className="student-btn-secondary px-6 gap-2">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="student-glass-card flex h-fit flex-col items-center space-y-4 p-6 text-center shadow-sm">
            <div className="relative">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-primary/20 bg-secondary shadow-inner">
                <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
              </div>
              <label className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md transition hover:scale-105" aria-label="Change profile picture">
                <Camera className="h-4.5 w-4.5" />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarChange} disabled={isUploadingAvatar} />
              </label>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground">{user.displayName}</h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">JPG, PNG, or WebP up to 2 MB.</p>
            </div>
            <div className="w-full border-t border-border pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-success">
                {session.role} Role
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="student-glass-card space-y-4 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-foreground"><User className="h-5 w-5 text-primary" />Account Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="Name" value={user.displayName} />
              <ProfileField label="Email" value={user.email} />
              {fields.slice(2).map((field) => <ProfileField key={field.label} label={field.label} value={field.value} />)}
              <ProfileField label="Account Status" value={user.isActive ? "Active" : "Inactive"} />
            </div>
          </div>

          <div className="student-glass-card space-y-4 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-foreground"><ShieldAlert className="h-5 w-5 text-primary" />Account Security</h3>
            <ChangePasswordForm email={user.email} />
            <p className="text-sm text-muted-foreground">Forgot your password? Use the “Forgot password?” link on the sign-in page.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
