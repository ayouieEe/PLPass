import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useReports, useStudents } from "@/hooks/useRepositoryQueries";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { Student } from "@/types/domain";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  isLoading: boolean;
  isError: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function useStudentScope(): StudentScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const studentQuery = useStudents({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "student" },
    student: studentQuery.data?.items[0],
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

export function StudentReportsPage() {
  const scope = useStudentScope();
  const reportsQuery = useReports({ pageSize: 100 }, scope.context);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }

  if (reportsQuery.isLoading) {
    return <LoadingState label="Loading report history" />;
  }

  const history: ReportHistoryRecord[] = (reportsQuery.data?.items ?? []).map((report) => ({
    id: report.id,
    name: report.title,
    scope: report.scope,
    generatedAt: report.generatedAt ? dateFormatter.format(new Date(report.generatedAt)) : "Queued",
    status: report.status
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student"
        title="Report History"
        description="Review generated attendance exports and student-scoped report requests."
      />
      <ReportHistoryTable records={history} />
    </div>
  );
}
