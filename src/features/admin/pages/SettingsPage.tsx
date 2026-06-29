import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  DetailPanel,
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

export function SettingsPage() {
  const scope = useAdminScope();
  const users = useUsers({ pageSize: 100 }, scope.context);
  const settings = useSystemSettings(scope.context);
  const adminUser = users.data?.items.find((user) => user.id === scope.userId);
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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <DetailPanel title="Profile information">
          <dl className="grid gap-3">
            <div><dt className="font-medium text-foreground">Full Name</dt><dd>{userName(users.data?.items ?? [], scope.userId)}</dd></div>
            <div><dt className="font-medium text-foreground">Employee ID</dt><dd>{scope.profile?.employeeNumber ?? "Controlled by administration"}</dd></div>
            <div><dt className="font-medium text-foreground">Email Address</dt><dd>{adminUser?.email ?? "Controlled by authentication"}</dd></div>
            <div><dt className="font-medium text-foreground">Assigned Department</dt><dd>{departmentName(scope.departments, scope.profile?.departmentId)}</dd></div>
            <div><dt className="font-medium text-foreground">Role</dt><dd>Dean Admin</dd></div>
            <div><dt className="font-medium text-foreground">Account Status</dt><dd><StatusBadge label={adminUser?.isActive ? "Active" : "Inactive"} tone={adminUser?.isActive ? "success" : "danger"} /></dd></div>
          </dl>
        </DetailPanel>

        {settings.data ? (
          <form className="grid gap-4 rounded-lg border bg-surface p-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
            {[
              ["Institution name", "institutionName"],
              ["School year", "currentSchoolYear"],
              ["Late cutoff minutes", "attendanceLateCutoffMinutes"],
              ["Default session minutes", "defaultSessionDurationMinutes"],
              ["Reader policy", "readerPolicy"],
              ["Credential policy", "credentialStatusPolicy"],
              ["Notification preference note", "notificationPreferencePlaceholder"]
            ].map(([label, name]) => (
              <label key={name} className="space-y-2 text-sm font-medium">
                <span>{label}</span>
                <input className="plpass-field h-10 w-full rounded-md border px-3" {...form.register(name as keyof SettingsFormValues)} />
              </label>
            ))}
            <div className="flex items-center justify-between gap-3 border-t pt-4 md:col-span-2">
              <p className="text-sm text-muted-foreground">Department assignment is read-only and controlled through Dean assignment administration.</p>
              <Button type="submit" disabled={settings.updateMutation.isPending}>Save settings</Button>
            </div>
            {settings.updateMutation.isSuccess ? <p className="text-sm text-success md:col-span-2">Settings saved.</p> : null}
          </form>
        ) : null}
      </section>

      <UnavailablePanel title="Profile actions" message="Profile picture storage, notification preference persistence, and role changes are unavailable in the current backend. Password changes must use the existing secure authentication flow." />
    </AdminFrame>
  );
}
