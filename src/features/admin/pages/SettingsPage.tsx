import { useEffect, type ComponentType } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Award, Building2, Camera, Hash, Key, Mail, School, Settings, ShieldAlert, User } from "lucide-react";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminSectionCard,
  UnavailablePanel,
  departmentName,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useSystemSettings, useUsers } from "@/hooks/useRepositoryQueries";

const settingsSchema = z.object({
  institutionName: z.string().min(2),
  currentSchoolYear: z.string().min(4),
  attendanceLateCutoffMinutes: z.coerce.number().min(0).max(120),
  defaultSessionDurationMinutes: z.coerce.number().min(15).max(480),
  readerPolicy: z.string().min(2),
  credentialStatusPolicy: z.string().min(2),
  notificationPreferencePlaceholder: z.string().min(2)
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

type ProfileFieldProps = {
  label: string;
  value?: string | number | null;
  icon: ComponentType<{ className?: string }>;
  children?: React.ReactNode;
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ProfileField({ label, value, icon: Icon, children }: ProfileFieldProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-highlight text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        {children ?? <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value ?? "N/A"}</p>}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const scope = useAdminScope();
  const users = useUsers({ pageSize: 100 }, scope.context);
  const settings = useSystemSettings(scope.context);
  const adminUser = users.data?.items.find((user) => user.id === scope.userId);
  const adminName = userName(users.data?.items ?? [], scope.userId);
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema)
  });

  useEffect(() => {
    if (!settings.data) return;
    form.reset({
      institutionName: settings.data.institutionName,
      currentSchoolYear: settings.data.currentSchoolYear,
      attendanceLateCutoffMinutes: settings.data.attendanceLateCutoffMinutes,
      defaultSessionDurationMinutes: settings.data.defaultSessionDurationMinutes,
      readerPolicy: settings.data.readerPolicy,
      credentialStatusPolicy: settings.data.credentialStatusPolicy,
      notificationPreferencePlaceholder: settings.data.notificationPreferencePlaceholder
    });
  }, [form, settings.data]);

  const submit = form.handleSubmit((values) => settings.updateMutation.mutate(values));

  return (
    <AdminFrame>
      <AdminPageHeader title="Settings and Admin Profile" accessibleTitle="System settings" description="Dean profile, assigned department, and supported attendance policy settings." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      {scope.isLoading || settings.isLoading || users.isLoading ? <LoadingState label="Loading settings" /> : null}

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AdminSectionCard className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-highlight bg-secondary text-3xl font-bold text-primary shadow-inner">
              {initialsFor(adminName)}
            </div>
            <span className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-disabled text-muted-foreground shadow-md" title="Profile picture upload is unavailable in the current backend.">
              <Camera className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-4">
            <h3 className="text-lg font-bold text-foreground">{adminName}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{adminUser?.email ?? "Controlled by authentication"}</p>
          </div>

          <div className="mt-5 w-full border-t border-border pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              Dean Admin Role
            </span>
          </div>
        </AdminSectionCard>

        <div className="space-y-4">
          <AdminSectionCard>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <User className="h-5 w-5 text-primary" />
              Admin Information
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="Full Name" value={adminName} icon={User} />
              <ProfileField label="Email Address" value={adminUser?.email ?? "Controlled by authentication"} icon={Mail} />
              <ProfileField label="Employee ID" value={scope.profile?.employeeNumber ?? "Controlled by administration"} icon={Hash} />
              <ProfileField label="Assigned Department" value={departmentName(scope.departments, scope.profile?.departmentId)} icon={School} />
              <ProfileField label="Current Semester" value={scope.activeSemester ? `${scope.activeSemester.label} ${scope.activeSemester.schoolYear}` : "No active semester"} icon={Award} />
              <ProfileField label="Institution" value={settings.data?.institutionName ?? "PLPass"} icon={Building2} />
              <ProfileField label="Role" value="Dean Admin" icon={ShieldAlert} />
              <ProfileField label="Account Status" icon={ShieldAlert}>
                <div className="mt-1">
                  <StatusBadge label={adminUser?.isActive ? "Active" : "Inactive"} tone={adminUser?.isActive ? "success" : "danger"} />
                </div>
              </ProfileField>
            </div>
          </AdminSectionCard>

          {settings.data ? (
            <form className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm" onSubmit={(event) => void submit(event)}>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <Settings className="h-5 w-5 text-primary" />
                Attendance Policy Settings
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["Institution name", "institutionName"],
                  ["School year", "currentSchoolYear"],
                  ["Late cutoff minutes", "attendanceLateCutoffMinutes"],
                  ["Default session minutes", "defaultSessionDurationMinutes"],
                  ["Reader policy", "readerPolicy"],
                  ["Credential policy", "credentialStatusPolicy"],
                  ["Notification preference note", "notificationPreferencePlaceholder"]
                ].map(([label, name]) => (
                  <label key={name} className="space-y-1.5 text-xs font-semibold text-foreground">
                    <span>{label}</span>
                    <input className="plpass-field h-10 w-full rounded-xl border px-3 text-sm outline-none" {...form.register(name as keyof SettingsFormValues)} />
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Department assignment is read-only and controlled through Dean assignment administration.</p>
                <Button type="submit" disabled={settings.updateMutation.isPending}>Save settings</Button>
              </div>
              {settings.updateMutation.isSuccess ? <p className="text-sm text-success">Settings saved.</p> : null}
            </form>
          ) : null}

          <section className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Key className="h-5 w-5 text-primary" />
              Account Actions
            </h3>
            <div className="mt-3">
              <UnavailablePanel title="Profile actions" message="Profile picture storage, notification preference persistence, and role changes are unavailable in the current backend. Password changes must use the existing secure authentication flow." />
            </div>
          </section>
        </div>
      </section>
    </AdminFrame>
  );
}
