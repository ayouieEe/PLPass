import { useMemo, useState } from "react";
import { Download, Eye, FileSpreadsheet, FileText, Filter, Search } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import type { AuditLog, AuditModule } from "@/types/audit";

// Sample audit log data
const SAMPLE_AUDIT_LOGS: AuditLog[] = [
  {
    id: "LOG-001",
    timestamp: "2026-07-12T08:00:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Authentication",
    action: "Login",
    description: "Organizer logged into the system",
    deviceInfo: "Chrome/Windows"
  },
  {
    id: "LOG-002",
    timestamp: "2026-07-12T08:15:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Event Management",
    action: "Event Created",
    description: 'Created event "AHTOMP Hospitality Leadership Summit 2026" (EVT-2026-015)',
    deviceInfo: "Chrome/Windows",
    eventId: "evt-015",
    eventCode: "EVT-2026-015"
  },
  {
    id: "LOG-003",
    timestamp: "2026-07-12T08:16:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Event Management",
    action: "Event Published",
    description: "Published event EVT-2026-015",
    deviceInfo: "Chrome/Windows",
    eventId: "evt-015",
    eventCode: "EVT-2026-015"
  },
  {
    id: "LOG-004",
    timestamp: "2026-07-12T09:00:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Event Management",
    action: "Session Started",
    description: "Started attendance session for EVT-2026-015",
    deviceInfo: "Chrome/Windows",
    eventId: "evt-015",
    eventCode: "EVT-2026-015"
  },
  {
    id: "LOG-005",
    timestamp: "2026-07-12T11:30:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Event Management",
    action: "Session Ended",
    description: "Attendance session ended for EVT-2026-015",
    deviceInfo: "Chrome/Windows",
    eventId: "evt-015",
    eventCode: "EVT-2026-015"
  },
  {
    id: "LOG-006",
    timestamp: "2026-07-12T11:45:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "User Management",
    action: "Excused/Correction Request Approved",
    description: "Approved attendance correction for Maria Santos",
    deviceInfo: "Chrome/Windows",
    studentId: "stu-101",
    studentName: "Maria Santos"
  },
  {
    id: "LOG-007",
    timestamp: "2026-07-12T13:10:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Authentication Methods",
    action: "QR Code Regenerated",
    description: "Generated a new QR code for John Cruz",
    deviceInfo: "Safari/Mac OS",
    studentId: "stu-102",
    studentName: "John Cruz"
  },
  {
    id: "LOG-008",
    timestamp: "2026-07-12T14:30:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Analytics",
    action: "Analytics Report Exported",
    description: "Exported Attendance Analytics Report (PDF)",
    deviceInfo: "Firefox/Windows"
  },
  {
    id: "LOG-009",
    timestamp: "2026-07-12T15:00:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "User Management",
    action: "Student Account Updated",
    description: "Updated student account for Ximena Garcia",
    deviceInfo: "Chrome/Windows",
    studentId: "stu-103",
    studentName: "Ximena Garcia"
  },
  {
    id: "LOG-010",
    timestamp: "2026-07-12T15:45:00Z",
    organizerId: "org-1",
    organizerName: "Juan Dela Cruz",
    module: "Profile",
    action: "Profile Updated",
    description: "Updated organizer profile information",
    deviceInfo: "Chrome/Windows"
  }
];

function formatDate(isoString: string) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}

function AuditLogDetailsModal({
  log,
  onClose
}: {
  log: AuditLog | null;
  onClose: () => void;
}) {
  if (!log) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Audit Log Details</h2>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2 rounded-lg border bg-surface p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Timestamp</p>
            <p className="text-sm font-medium text-foreground">{formatDate(log.timestamp)}</p>
          </div>

          <div className="grid gap-2 rounded-lg border bg-surface p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Organizer</p>
            <p className="text-sm font-medium text-foreground">{log.organizerName}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2 rounded-lg border bg-surface p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Module</p>
              <p className="text-sm font-medium text-foreground">{log.module}</p>
            </div>
            <div className="grid gap-2 rounded-lg border bg-surface p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Action</p>
              <p className="text-sm font-medium text-foreground">{log.action}</p>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border bg-surface p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Description</p>
            <p className="text-sm font-medium text-foreground">{log.description}</p>
          </div>

          {log.eventCode && (
            <div className="grid gap-2 rounded-lg border bg-surface p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Event</p>
              <p className="text-sm font-medium text-foreground">{log.eventCode}</p>
            </div>
          )}

          {log.studentName && (
            <div className="grid gap-2 rounded-lg border bg-surface p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Student</p>
              <p className="text-sm font-medium text-foreground">{log.studentName}</p>
            </div>
          )}

          <div className="grid gap-2 rounded-lg border bg-surface p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Device Info</p>
            <p className="text-sm font-medium text-foreground">{log.deviceInfo}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExportButton({ icon: Icon, label }: { icon: typeof FileSpreadsheet; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 min-w-20 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export function AuditTrailPage() {
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const modules: AuditModule[] = [
    "Authentication",
    "User Management",
    "Event Management",
    "Authentication Methods",
    "Analytics",
    "Profile"
  ];

  const filteredLogs = useMemo(() => {
    return SAMPLE_AUDIT_LOGS.filter((log) => {
      const matchesSearch =
        !search ||
        log.organizerName.toLowerCase().includes(search.toLowerCase()) ||
        log.eventCode?.toLowerCase().includes(search.toLowerCase()) ||
        log.studentName?.toLowerCase().includes(search.toLowerCase()) ||
        log.description.toLowerCase().includes(search.toLowerCase());

      const matchesModule = !module || log.module === module;

      const logDate = new Date(log.timestamp).toISOString().split("T")[0];
      const matchesDateFrom = !dateFrom || logDate >= dateFrom;
      const matchesDateTo = !dateTo || logDate <= dateTo;

      return matchesSearch && matchesModule && matchesDateFrom && matchesDateTo;
    });
  }, [search, module, dateFrom, dateTo]);

  const columns = useMemo<ColDef<AuditLog>[]>(
    () => [
      {
        headerName: "Date & Time",
        field: "timestamp",
        flex: 1.2,
        minWidth: 160,
        valueFormatter: ({ value }) => formatDate(value)
      },
      {
        headerName: "Organizer",
        field: "organizerName",
        flex: 1,
        minWidth: 140
      },
      {
        headerName: "Module",
        field: "module",
        flex: 1,
        minWidth: 160
      },
      {
        headerName: "Action",
        field: "action",
        flex: 1.2,
        minWidth: 180
      },
      {
        headerName: "Description",
        field: "description",
        flex: 1.5,
        minWidth: 240
      },
      {
        headerName: "Device Info",
        field: "deviceInfo",
        flex: 1,
        minWidth: 140
      },
      {
        headerName: "Actions",
        field: "id",
        width: 100,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<AuditLog>) => (
          <button
            type="button"
            onClick={() => params.data && setSelectedLog(params.data)}
            className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            View
          </button>
        )
      }
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizer"
        title="Audit Trail"
        description="Monitor all significant actions performed within the PLPass system. This provides accountability, activity tracking, and a complete history of system operations."
      />

      <div className="rounded-lg border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Audit Logs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Search, filter, and view detailed audit log entries.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" aria-hidden="true" />
            {filteredLogs.length} results
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          <label className="relative block lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by organizer, event, student, or description"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Filter by module"
          >
            <option value="">All modules</option>
            {modules.map((mod) => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Filter by date from"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Filter by date to"
          />
        </div>
      </div>

      {filteredLogs.length > 0 ? (
        <PLPassDataGrid
          label="Audit logs"
          data={filteredLogs}
          columns={columns}
          emptyTitle="No audit logs found"
          emptyDescription="No logs match your current search and filter criteria."
          enableColumnVisibility
          hideHeader
        />
      ) : (
        <div className="rounded-lg border bg-surface p-8">
          <EmptyState title="No audit logs found" description="No logs match your current search and filter criteria." />
        </div>
      )}

      <div className="rounded-lg border bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Export Audit Logs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Download audit log records in your preferred format.</p>
          </div>
          <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">
            XLSX / PDF
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton icon={FileSpreadsheet} label="Export as XLSX" />
          <ExportButton icon={FileText} label="Export as PDF" />
        </div>
      </div>

      <AuditLogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
