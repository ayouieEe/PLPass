import type { ComponentType } from "react";
import {
  User,
  ShieldAlert,
  Camera,
  LogOut,
  Mail,
  Award,
  Hash,
  School,
  GraduationCap,
  CalendarCheck,
  Database,
  ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useUser,
  useStudents,
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useEvents,
  useStudentCredentialStatus
} from "@/hooks/useRepositoryQueries";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  ensureStudentIdentityReadiness,
  formatCredentialStatus,
  getStudentEventMetrics,
  getStudentEventRecords,
  hasUsableQrCredential,
  studentVisibleEvents
} from "@/features/student/studentExperience";
import type { Program, Department } from "@/types/domain";

type ProfileFieldProps = {
  label: string;
  value?: string | number | null;
  icon: ComponentType<{ className?: string }>;
};

function getNameById<T extends Program | Department>(items: T[] | undefined, id: string | undefined) {
  return items?.find((item) => item.id === id)?.name ?? "N/A";
}

function ProfileField({ label, value, icon: Icon }: ProfileFieldProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/40 p-4 transition-all">
      <div className="h-10 w-10 shrink-0 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</span>
        <p className="mt-0.5 font-semibold text-sm text-foreground truncate">{value ?? "N/A"}</p>
      </div>
    </div>
  );
}

export function StudentProfilePage() {
  const { session, logout } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const userQuery = useUser(session?.userId, context);
  const studentQuery = useStudents({ pageSize: 1 }, context);
  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, context);
  const credentialStatusQuery = useStudentCredentialStatus(studentQuery.data?.items[0]?.id, context);

  if (!session) {
    return <ErrorState title="No active session" message="Sign in with a student account to view this page." />;
  }

  const isLoading =
    userQuery.isLoading ||
    catalog.departments.isLoading ||
    catalog.programs.isLoading ||
    studentQuery.isLoading ||
    eventsQuery.isLoading ||
    sessionsQuery.isLoading ||
    recordsQuery.isLoading ||
    credentialStatusQuery.isLoading;

  if (isLoading) {
    return <LoadingState label="Loading profile information" />;
  }

  if (userQuery.isError || studentQuery.isError || eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load profile" message="An error occurred while loading repository details." />;
  }

  const user = userQuery.data;
  const student = studentQuery.data?.items[0];
  const departments = catalog.departments.data?.items;
  const programs = catalog.programs.data?.items;

  if (!user || !student) {
    return <ErrorState title="Profile not found" message="No profile details found for this student account." />;
  }

  const eventRecords = getStudentEventRecords({
    studentId: student.id,
    records: recordsQuery.data?.items ?? [],
    sessions: sessionsQuery.data?.items ?? [],
    events: studentVisibleEvents(eventsQuery.data?.items ?? [])
  });
  const metrics = getStudentEventMetrics(eventRecords);
  const readiness = ensureStudentIdentityReadiness(credentialStatusQuery.data);
  const credentialReadinessError = credentialStatusQuery.isError;
  const hasQrCredential = hasUsableQrCredential(readiness);
  const hasFacialEnrollment = readiness.faceEnrolled;
  const qrCredentialLabel = credentialReadinessError
    ? "Unable to read"
    : hasQrCredential
      ? formatCredentialStatus(readiness.qrStatus)
      : "Not configured";
  const facialEnrollmentLabel = credentialReadinessError
    ? "Unable to read"
    : hasFacialEnrollment
      ? formatCredentialStatus(readiness.faceStatus)
      : "Organizer managed";
  const avatarSeed = encodeURIComponent(user.displayName || "Student");
  const avatarUrl = user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${avatarSeed}`;

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Review your Supabase-backed student profile, attendance readiness, and account status."
        actions={
          <Button variant="outline" onClick={handleLogout} className="student-btn-secondary px-6 gap-2">
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        }
      />

      {credentialReadinessError ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="font-semibold text-foreground">Credential readiness could not be loaded</p>
          <p className="mt-1 text-muted-foreground">
            Profile details are still available, but QR/facial readiness needs the Supabase credential tables and policies to be reachable.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Supabase Profile Summary */}
        <div className="student-glass-card p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
          <div className="relative">
            <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-primary/20 bg-secondary flex items-center justify-center shadow-inner">
              <img
                src={avatarUrl}
                alt="Student Avatar"
                className="h-full w-full object-cover"
              />
            </div>
            <span
              className="absolute bottom-1 right-1 h-9 w-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md border-2 border-white"
              aria-label="Profile image from Supabase profile"
              title="Profile image from Supabase profile"
            >
              <Camera className="h-4.5 w-4.5" />
            </span>
          </div>

          <div>
            <h3 className="font-bold text-lg text-foreground">{user.displayName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Profile images are read from Supabase profile data. Upload changes are handled by an administrator.
            </p>
          </div>

          <div className="w-full border-t border-border pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-success/10 text-success border border-success/20 capitalize">
              Student Role
            </span>
          </div>
        </div>

        {/* Center: Student Information Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="student-glass-card p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Student Information
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="Full Name" value={user.displayName} icon={User} />
              <ProfileField label="Email Address" value={user.email} icon={Mail} />
              <ProfileField label="Student Number" value={student.studentNumber} icon={Hash} />
              <ProfileField label="Department" value={getNameById(departments, student.departmentId)} icon={School} />
              <ProfileField label="Program" value={getNameById(programs, student.programId)} icon={GraduationCap} />
              <ProfileField label="Year Level" value={`Year ${student.yearLevel}`} icon={Award} />
              <ProfileField label="Section" value={student.section} icon={CalendarCheck} />
              <ProfileField label="Enrollment Status" value={student.status} icon={ShieldAlert} />
              <ProfileField label="Account Status" value={user.isActive ? "Active" : "Inactive"} icon={ShieldCheck} />
              <ProfileField label="Profile Source" value="Supabase profile record" icon={Database} />
            </div>
          </div>

          <div className="student-glass-card p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Attendance Readiness & Statistics
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="QR Credential" value={qrCredentialLabel} icon={Hash} />
              <ProfileField label="Facial Enrollment" value={facialEnrollmentLabel} icon={Camera} />
              <ProfileField label="Event Records" value={metrics.totalCount} icon={CalendarCheck} />
              <ProfileField label="Attendance Rate" value={`${metrics.attendanceRate}%`} icon={Award} />
              <ProfileField label="Account Created" value={formatDisplayDate(user.createdAt)} icon={CalendarCheck} />
              <ProfileField label="Authentication Provider" value="Supabase Auth" icon={Database} />
            </div>
          </div>

          {/* Change Password Form Card */}
          <div className="student-glass-card p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Account Security
            </h3>

            <form onSubmit={(event) => event.preventDefault()} className="space-y-4 max-w-md">
              <p className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                Password changes are managed by Supabase Auth. Contact an administrator if your account password needs to be reset.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Current Password</label>
                <input
                  type="password"
                  className="student-input h-10 w-full px-3 py-2 text-sm focus:outline-none"
                  value=""
                  readOnly
                  disabled
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Password</label>
                <input
                  type="password"
                  className="student-input h-10 w-full px-3 py-2 text-sm focus:outline-none"
                  value=""
                  readOnly
                  disabled
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <input
                  type="password"
                  className="student-input h-10 w-full px-3 py-2 text-sm focus:outline-none"
                  value=""
                  readOnly
                  disabled
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" disabled className="student-btn-primary px-6 mt-2">
                Managed by Supabase Auth
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
