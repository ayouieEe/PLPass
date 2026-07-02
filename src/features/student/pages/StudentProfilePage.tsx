import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  User,
  ShieldAlert,
  Key,
  Camera,
  LogOut,
  Mail,
  Award,
  Hash,
  School,
  GraduationCap,
  CalendarCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useUser,
  useStudents,
  useAcademicCatalog
} from "@/hooks/useRepositoryQueries";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { Program, Department } from "@/types/domain";

type ProfileFieldProps = {
  label: string;
  value?: string | number | null;
  icon: React.ComponentType<{ className?: string }>;
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
  const catalog = useAcademicCatalog({ pageSize: 50 }, context);

  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sync / initialize default avatar
  useEffect(() => {
    const savedAvatar = localStorage.getItem("plpass-student-avatar");
    if (savedAvatar) {
      setAvatarUrl(savedAvatar);
    } else {
      setAvatarUrl(`https://api.dicebear.com/7.x/initials/svg?seed=${session?.displayName ?? "Student"}`);
    }
  }, [session]);

  if (!session) {
    return <ErrorState title="No active session" message="Sign in with a student account to view this page." />;
  }

  const isLoading =
    userQuery.isLoading ||
    catalog.departments.isLoading ||
    catalog.programs.isLoading ||
    studentQuery.isLoading;

  if (isLoading) {
    return <LoadingState label="Loading profile information" />;
  }

  if (userQuery.isError || studentQuery.isError) {
    return <ErrorState title="Unable to load profile" message="An error occurred while loading repository details." />;
  }

  const user = userQuery.data;
  const student = studentQuery.data?.items[0];
  const departments = catalog.departments.data?.items;
  const programs = catalog.programs.data?.items;

  if (!user || !student) {
    return <ErrorState title="Profile not found" message="No profile details found for this student account." />;
  }

  function handleLogout() {
    logout();
    queryClient.clear();
    navigate(APP_ROUTES.login, { replace: true });
  }

  // Handle mock avatar change
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const objectUrl = URL.createObjectURL(file);
      setAvatarUrl(objectUrl);
      localStorage.setItem("plpass-student-avatar", objectUrl);
      toast.success("Profile picture updated successfully!");
    }
  }

  // Handle password change
  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();

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
    }, 1200);
  }

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Manage your student account settings, change password, and upload photos."
        actions={
          <Button variant="outline" onClick={handleLogout} className="student-btn-secondary px-6 gap-2">
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Avatar / Profile Picture Upload View */}
        <div className="student-glass-card p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
          <div className="relative group">
            <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-primary/20 bg-secondary flex items-center justify-center shadow-inner">
              <img
                src={avatarUrl}
                alt="Student Avatar"
                className="h-full w-full object-cover"
              />
            </div>
            <label className="absolute bottom-1 right-1 h-9 w-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md cursor-pointer hover:scale-105 transition-transform border-2 border-white">
              <Camera className="h-4.5 w-4.5" />
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <h3 className="font-bold text-lg text-foreground">{user.displayName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
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
            </div>
          </div>

          {/* Change Password Form Card */}
          <div className="student-glass-card p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Change Account Password
            </h3>

            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Current Password</label>
                <input
                  type="password"
                  className="student-input h-10 w-full px-3 py-2 text-sm focus:outline-none"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Password</label>
                <input
                  type="password"
                  className="student-input h-10 w-full px-3 py-2 text-sm focus:outline-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <input
                  type="password"
                  className="student-input h-10 w-full px-3 py-2 text-sm focus:outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" disabled={isChangingPassword} className="student-btn-primary px-6 mt-2">
                {isChangingPassword ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
