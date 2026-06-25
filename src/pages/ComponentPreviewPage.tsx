import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarCheck, FileText, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AttendanceLineChart } from "@/components/charts/AttendanceLineChart";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ParticipationBarChart } from "@/components/charts/ParticipationBarChart";
import { PresentLateAbsentPieChart } from "@/components/charts/PresentLateAbsentPieChart";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FileUploadField } from "@/components/forms/FileUploadField";
import { FormSection } from "@/components/forms/FormSection";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { TextField } from "@/components/forms/TextField";
import { TimePickerField } from "@/components/forms/TimePickerField";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { FormModal } from "@/components/modals/FormModal";
import { AttachmentUploader } from "@/components/shared/AttachmentUploader";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { PageHeader } from "@/components/shared/PageHeader";
import { RoleBasedSidebar } from "@/components/shared/RoleBasedSidebar";
import { StatCard } from "@/components/shared/StatCard";
import { FilterBar } from "@/components/tables/FilterBar";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { NFCReaderInput } from "@/features/attendance/NFCReaderInput";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import { ReportPreviewCard } from "@/features/reports/ReportPreviewCard";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import type { ReportHistoryRecord } from "@/features/reports/types";

type PreviewStudent = {
  id: string;
  student: string;
  course: string;
  status: "Present" | "Late" | "Absent";
};

const previewFormSchema = z.object({
  title: z.string().min(2, "Title is required"),
  role: z.enum(["admin", "faculty", "organizer", "student"]),
  date: z.string().min(1, "Date is required"),
  time: z.string().min(1, "Time is required"),
  notes: z.string().min(5, "Notes need a little detail"),
  attachment: z.unknown().optional()
});

type PreviewFormValues = z.infer<typeof previewFormSchema>;

const attendanceTrend = [
  { label: "Mon", present: 42, late: 4, absent: 3 },
  { label: "Tue", present: 39, late: 6, absent: 4 },
  { label: "Wed", present: 44, late: 3, absent: 2 },
  { label: "Thu", present: 41, late: 5, absent: 3 }
];

const pieData = [
  { name: "Present", value: 42 },
  { name: "Late", value: 4 },
  { name: "Absent", value: 3 }
];

const participationData = [
  { label: "BSIT", participation: 92 },
  { label: "BSA", participation: 88 },
  { label: "BSED", participation: 84 }
];

const riskData = [
  { label: "Week 1", watchlist: 5, atRisk: 2 },
  { label: "Week 2", watchlist: 4, atRisk: 3 },
  { label: "Week 3", watchlist: 3, atRisk: 1 }
];

const liveRecords: LiveAttendanceRecord[] = [
  { id: "1", studentName: "Alyssa Reyes", identifier: "2026-0001", status: "present", timestamp: "08:01 AM" },
  { id: "2", studentName: "Marco Santos", identifier: "2026-0002", status: "late", timestamp: "08:14 AM" },
  { id: "3", studentName: "Lea Cruz", identifier: "2026-0003", status: "manual", timestamp: "08:20 AM" }
];

const reportHistory: ReportHistoryRecord[] = [
  { id: "r1", name: "Weekly Attendance", scope: "BSIT 2A", generatedAt: "Jun 24, 2026", status: "ready" },
  { id: "r2", name: "Event Participation", scope: "Orientation", generatedAt: "Jun 23, 2026", status: "processing" }
];

const tableRows: PreviewStudent[] = [
  { id: "s1", student: "Alyssa Reyes", course: "BSIT 2A", status: "Present" },
  { id: "s2", student: "Marco Santos", course: "BSIT 2A", status: "Late" },
  { id: "s3", student: "Lea Cruz", course: "BSIT 2A", status: "Absent" }
];

export function ComponentPreviewPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [nfcValue, setNfcValue] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [reportQuery, setReportQuery] = useState("");
  const [period, setPeriod] = useState("week");
  const [qrEnabled, setQrEnabled] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const form = useForm<PreviewFormValues>({
    resolver: zodResolver(previewFormSchema),
    defaultValues: {
      title: "BSIT Morning Session",
      role: "faculty",
      date: "2026-06-26",
      time: "08:00",
      notes: "Reusable component preview sample."
    }
  });

  const columns = useMemo<ColumnDef<PreviewStudent>[]>(
    () => [
      { accessorKey: "student", header: "Student" },
      { accessorKey: "course", header: "Course" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          const tone = status === "Present" ? "success" : status === "Late" ? "warning" : "danger";
          return <StatusBadge label={status} tone={tone} />;
        }
      }
    ],
    []
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal preview"
        title="PLPass Component Library"
        description="Reusable Phase 1 components using typed temporary data only."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)}>
              Open confirm
            </Button>
            <Button type="button" onClick={() => setFormOpen(true)}>
              Open form modal
            </Button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="Expected" value="49" description="Students in session" icon={Users} />
        <StatCard title="Present rate" value="86%" trend="+4% from last meeting" icon={CalendarCheck} tone="success" />
        <StatCard title="Reports ready" value="12" icon={FileText} tone="info" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-lg">
          <RoleBasedSidebar role="faculty" userLabel="Faculty Preview" />
        </div>
        <div className="space-y-4">
          <FilterBar
            search={search}
            selectedFilter={filter}
            filters={[
              { label: "All", value: "all" },
              { label: "Present", value: "present" },
              { label: "Late", value: "late" }
            ]}
            onSearchChange={setSearch}
            onFilterChange={setFilter}
          />
          <DataTable data={tableRows} columns={columns} emptyDescription="Try clearing filters in a later phase." />
          <div className="flex flex-wrap gap-3">
            <ExportButtons onExportCsv={() => undefined} onExportPdf={() => undefined} />
            <AttachmentUploader onFilesSelected={() => undefined} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <FormSection title="Form components" description="React Hook Form fields with Zod validation support.">
          <TextField control={form.control} name="title" label="Session title" />
          <SelectField
            control={form.control}
            name="role"
            label="Role"
            options={[
              { label: "Admin", value: "admin" },
              { label: "Faculty", value: "faculty" },
              { label: "Organizer", value: "organizer" },
              { label: "Student", value: "student" }
            ]}
          />
          <DatePickerField control={form.control} name="date" label="Date" />
          <TimePickerField control={form.control} name="time" label="Time" />
          <TextAreaField control={form.control} name="notes" label="Notes" />
          <FileUploadField control={form.control} name="attachment" label="Attachment" />
          <div className="md:col-span-2">
            <SubmitButton isSubmitting={form.formState.isSubmitting}>Submit sample</SubmitButton>
          </div>
        </FormSection>
        <div className="space-y-4">
          <LoadingState label="Loading attendance records" />
          <EmptyState title="No matching students" description="Empty states use neutral surfaces and semantic text." />
          <ErrorState title="Unable to load preview" message="Error states use danger tokens outside the green brand palette." />
        </div>
      </section>

      <section className="space-y-4">
        <ActiveSessionHeader title="IT 204 Attendance" venue="Room 302" startedAt="Started 08:00 AM" statusLabel="live" />
        <SessionSummaryCards present={42} late={4} absent={3} total={49} />
        <div className="grid gap-4 lg:grid-cols-2">
          <NFCReaderInput value={nfcValue} onChange={setNfcValue} onSubmit={setNfcValue} />
          <LatestTapResultCard
            result={{
              studentName: "Alyssa Reyes",
              nfcValue: "NFC-PLP-0001",
              status: "present",
              message: "Tap accepted for the active session.",
              timestamp: "08:01 AM"
            }}
          />
          <LiveAttendanceList records={liveRecords} />
          <div className="space-y-4">
            <ManualLookupPanel query={manualQuery} onQueryChange={setManualQuery} onMarkPresent={() => undefined} />
            <QRFallbackPanel enabled={qrEnabled} onToggle={() => setQrEnabled((current) => !current)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AttendanceLineChart data={attendanceTrend} />
        <PresentLateAbsentPieChart data={pieData} />
        <ParticipationBarChart data={participationData} />
        <RiskSummaryChart data={riskData} />
        <div className="lg:col-span-2">
          <AttendanceTrendChart data={attendanceTrend} />
        </div>
      </section>

      <section className="space-y-4">
        <ReportFilterPanel query={reportQuery} period={period} onQueryChange={setReportQuery} onPeriodChange={setPeriod} onApply={() => undefined} />
        <ReportPreviewCard
          title="Attendance Summary"
          description="Preview card for generated report metadata."
          metrics={[
            { label: "Sessions", value: "8" },
            { label: "Average", value: "89%" },
            { label: "Exceptions", value: "6" }
          ]}
        />
        <ReportHistoryTable records={reportHistory} />
        <Button type="button" onClick={() => setGenerateOpen(true)}>
          Generate report modal
        </Button>
      </section>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm sample action"
        description="This modal demonstrates confirmation behavior without changing data."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />
      <FormModal
        open={formOpen}
        title="Sample form modal"
        description="Reusable modal shell for form workflows."
        onClose={() => setFormOpen(false)}
        onSubmit={() => setFormOpen(false)}
      >
        <TextField control={form.control} name="title" label="Title" />
      </FormModal>
      <GenerateReportModal open={generateOpen} reportName="Weekly Attendance" onClose={() => setGenerateOpen(false)} onGenerate={() => setGenerateOpen(false)} />
    </div>
  );
}
