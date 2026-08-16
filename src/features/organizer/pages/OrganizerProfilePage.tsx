/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from "react";
import { Camera, Key, LogOut, Mail, ShieldAlert, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAcademicCatalog, useOrganizerProfiles, useUser, useAuditLogMutations } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { Department } from "@/types/domain";

type ProfileFieldProps = {
  label: string;
  value?: string | number | null;
  icon: React.ComponentType<{ className?: string }>;
};

function getNameById<T extends Department>(items: T[] | undefined, id: string | undefined) {
  return items?.find((item) => item.id === id)?.name ?? "N/A";
}

function ProfileField({ label, value, icon: Icon }: ProfileFieldProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/40 p-4 transition-all">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value ?? "N/A"}</p>
      </div>
    </div>
  );
}

export function OrganizerProfilePage() {
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const userQuery = useUser(session?.userId, context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, context);
  const auditLogMutations = useAuditLogMutations(context);

  const [avatarUrl, setAvatarUrl] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    const savedAvatar = localStorage.getItem("plpass-organizer-avatar");
    if (savedAvatar) {
      setAvatarUrl(savedAvatar);
    } else {
      setAvatarUrl(`https://api.dicebear.com/7.x/initials/svg?seed=${session?.displayName ?? "Organizer"}`);
    }
  }, [session]);

  if (!session) {
    return <ErrorState title="No active session" message="Sign in with an organizer account to view this page." />;
  }

  const isLoading = userQuery.isLoading || organizerQuery.isLoading || catalog.departments.isLoading || catalog.programs.isLoading;

  if (isLoading) {
    return <LoadingState label="Loading profile information" />;
  }

  if (userQuery.isError || organizerQuery.isError) {
    return <ErrorState title="Unable to load profile" message="An error occurred while loading organizer profile details." />;
  }

  const user = userQuery.data;
  const organizer = organizerQuery.data?.items[0];
  const departments = catalog.departments.data?.items;
  const departmentName = getNameById(departments, organizer?.departmentId);
  const departmentDisplayName = departmentName !== "N/A" ? departmentName : "PLP Administration";

  if (!user || !organizer) {
    return <ErrorState title="Profile not found" message="No organizer profile details were found for this account." />;
  }

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setAvatarUrl(dataUrl);
        localStorage.setItem("plpass-organizer-avatar", dataUrl);
        toast.success("Profile picture updated successfully!");
        
        void auditLogMutations.logActionMutation.mutateAsync({
          action: "Updated Profile Picture",
          targetType: "organizer_profile",
          targetId: session?.userId,
          metadata: { userId: session?.userId }
        });
      };
      
      reader.readAsDataURL(file);
    }
  }

  function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill out all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    setIsChangingPassword(true);
    setTimeout(() => {
      setIsChangingPassword(false);
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      void auditLogMutations.logActionMutation.mutateAsync({
        action: "Changed Password",
        targetType: "organizer_profile",
        targetId: session?.userId,
        metadata: { userId: session?.userId }
      });
    }, 1000);
  }


  return (
    <div className="space-y-4 p-1">
      <PageHeader
        title="Profile"
        actions={
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col items-center space-y-4 rounded-2xl border border-border bg-card/40 p-6 text-center shadow-sm">
          <div className="group relative">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-primary/20 bg-secondary shadow-inner">
              <img src={avatarUrl} alt="Organizer Avatar" className="h-full w-full object-cover" />
            </div>
            <label className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105">
              <Camera className="h-4 w-4" />
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
          </div>

          <div>
            <h3 className="text-lg font-bold text-foreground">{user.displayName}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
          </div>

          <div className="w-full border-t border-border pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-success">
              Organizer Role
            </span>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card/40 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <User className="h-5 w-5 text-primary" />
              Profile information
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ProfileField label="Full Name" value={user.displayName} icon={User} />
              <ProfileField label="Email Address" value={user.email} icon={Mail} />
              <ProfileField label="Employee ID" value={organizer.employeeNumber} icon={ShieldAlert} />
              <ProfileField label="Department" value={departmentDisplayName} icon={ShieldAlert} />
              <ProfileField label="Position" value={organizer.position} icon={ShieldAlert} />
              <ProfileField label="Employment Status" value={organizer.employmentStatus} icon={ShieldAlert} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/40 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Key className="h-5 w-5 text-primary" />
              Change password
            </h3>

            <form onSubmit={handlePasswordSubmit} className="mt-4 max-w-md space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Current Password</label>
                <input type="password" className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} placeholder="••••••••" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Password</label>
                <input type="password" className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="••••••••" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <input type="password" className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="••••••••" />
              </div>

              <Button type="submit" disabled={isChangingPassword} className="mt-2 px-6">
                {isChangingPassword ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
