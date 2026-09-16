import { useEffect, useState, type ComponentType } from "react";
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
  ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { APP_ROUTES } from "@/lib/constants/routes";
import { formatDisplayDate } from "@/lib/utils/date";
import { getErrorMessage } from "@/lib/utils/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
    <div className="flex min-h-24 w-full items-start gap-3 overflow-hidden rounded-2xl border border-border bg-card/40 p-4 transition-all">
      <div className="h-10 w-10 shrink-0 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <p className="mt-0.5 break-words text-sm font-semibold leading-5 text-foreground">{value ?? "N/A"}</p>
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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(session?.displayName || "Student")}`;
    const storedAvatar = userQuery.data?.avatarUrl;
    if (!storedAvatar?.startsWith("profile-avatars:")) {
      setAvatarUrl(storedAvatar ?? fallback);
      return;
    }
    let cancelled = false;
    void getSupabaseBrowserClient()
      .storage.from("profile-avatars")
      .createSignedUrl(storedAvatar.slice("profile-avatars:".length), 3600)
      .then(({ data, error }) => {
        if (!cancelled) setAvatarUrl(error ? fallback : data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.displayName, userQuery.data?.avatarUrl]);

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
      const { error: uploadError } = await client.storage.from("profile-avatars").upload(objectPath, file, { contentType: file.type, cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;
      const { data: signedUrlData, error: signedUrlError } = await client.storage.from("profile-avatars").createSignedUrl(objectPath, 3600);
      if (signedUrlError) throw signedUrlError;
      const { error: profileError } = await client.from("profiles").update({ profile_picture: `profile-avatars:${objectPath}`, updated_at: new Date().toISOString() }).eq("id", session?.userId ?? "");
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

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  return (
    <div className="space-y-6 p-0 font-sans sm:space-y-8 sm:p-1">
      <PageHeader
        title="Profile"
        description="Manage your student details and attendance access."
        actions={
          <Button variant="outline" onClick={handleLogout} className="student-btn-secondary w-full gap-2 px-6 sm:w-auto">
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        }
      />

      {credentialReadinessError ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="font-semibold text-foreground">Attendance access could not be loaded</p>
          <p className="mt-1 text-muted-foreground">
            Profile details are still available. If this continues, ask an organizer to verify your attendance access.
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="student-glass-card flex h-fit flex-col items-center space-y-4 p-4 text-center shadow-sm sm:p-6">
            <div className="relative">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-primary/20 bg-secondary shadow-inner">
                <img
                  src={avatarUrl}
                  alt="Student Avatar"
                  className="h-full w-full object-cover"
                />
              </div>
              <label className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md transition hover:scale-105" aria-label="Change profile picture">
                <Camera className="h-4.5 w-4.5" />
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={isUploadingAvatar} className="sr-only" />
              </label>
            </div>

            <div className="min-w-0">
              <h3 className="break-words text-lg font-bold text-foreground">{user.displayName}</h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                JPG, PNG, or WebP up to 2 MB.
              </p>
            </div>

            <div className="w-full border-t border-border pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-success">
                Student Role
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="student-glass-card space-y-4 p-4 shadow-sm sm:p-6">
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
            </div>
          </div>

          <div className="student-glass-card space-y-4 p-4 shadow-sm sm:p-6">
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
            </div>
          </div>

          <div className="student-glass-card space-y-4 p-4 shadow-sm sm:p-6">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Account Security
            </h3>

            <ChangePasswordForm email={user.email} />
            <p className="text-sm text-muted-foreground">Forgot your password? Use the “Forgot password?” link on the sign-in page to receive a reset link at your school email.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

