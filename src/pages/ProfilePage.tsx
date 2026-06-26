import { LogOut, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAdminProfiles,
  useFacultyProfiles,
  useNfcCredentialForStudent,
  useOrganizerProfiles,
  useStudents,
  useUser
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { Program, Department } from "@/types/domain";

type ProfileFieldProps = {
  label: string;
  value?: string | number | null;
};

function maskCredential(value: string | undefined) {
  if (!value) {
    return "Not available";
  }
  return `${value.slice(0, 3)}-${"*".repeat(Math.max(value.length - 6, 4))}-${value.slice(-3)}`;
}

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
  const facultyQuery = useFacultyProfiles({ pageSize: 1 }, context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  const adminQuery = useAdminProfiles({ pageSize: 1 }, context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, context);
  const student = studentQuery.data?.items[0];
  const nfcCredential = useNfcCredentialForStudent(student?.id, context);

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
    (session.role === "student" && (studentQuery.isLoading || nfcCredential.isLoading)) ||
    (session.role === "faculty" && facultyQuery.isLoading) ||
    (session.role === "organizer" && organizerQuery.isLoading) ||
    (session.role === "admin" && adminQuery.isLoading);

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
      { label: "Student status", value: student?.status },
      { label: "NFC credential status", value: nfcCredential.data?.status ?? "Not available" },
      { label: "Masked credential identifier", value: maskCredential(nfcCredential.data?.nfcUid) },
      { label: "Date issued", value: nfcCredential.data?.issuedAt }
    );
  }

  if (session.role === "faculty") {
    const profile = facultyQuery.data?.items[0];
    fields.push(
      { label: "Employee ID", value: profile?.employeeNumber },
      { label: "Department", value: getNameById(departments, profile?.departmentId) },
      { label: "Employment status", value: profile?.employmentStatus },
      { label: "Profile image", value: "Placeholder" }
    );
  }

  if (session.role === "organizer") {
    const profile = organizerQuery.data?.items[0];
    fields.push(
      { label: "Employee ID", value: profile?.employeeNumber },
      { label: "Department", value: getNameById(departments, profile?.departmentId) },
      { label: "Position", value: profile?.position },
      { label: "Employment status", value: profile?.employmentStatus },
      { label: "Profile image", value: "Placeholder" }
    );
  }

  if (session.role === "admin") {
    const profile = adminQuery.data?.items[0];
    fields.push(
      { label: "Employee ID", value: profile?.employeeNumber },
      { label: "Department", value: getNameById(departments, profile?.departmentId) },
      { label: "Profile image", value: "Placeholder" }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Shared profile view backed by mock repositories."
        actions={
          <Button type="button" variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </Button>
        }
      />
      <section className="rounded-lg border bg-surface p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-secondary">
            <UserCircle className="h-7 w-7 text-brand-green-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold">{user.displayName}</h2>
            <p className="text-sm capitalize text-muted-foreground">{session.role}</p>
          </div>
        </div>
        <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <ProfileField key={field.label} label={field.label} value={field.value} />
          ))}
        </dl>
      </section>
    </div>
  );
}
