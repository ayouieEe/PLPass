const fs = require('fs');
const path = 'c:/Users/PLPASIG/Documents/Github/PLPass/src/features/organizer/pages/EventRecordsPage.tsx';

let content = fs.readFileSync(path, 'utf8');

// 1. Ensure CheckCircle2 is imported from lucide-react
if (!content.includes('CheckCircle2,')) {
  content = content.replace('BarChart3, CalendarCheck,', 'BarChart3, CalendarCheck, CheckCircle2,');
}

// 2. Add EventRecordsExportModal component before EventRecordsPage
const modalComponentCode = `
function EventRecordsExportModal({
  isOpen,
  onClose,
  records,
  filteredRecords,
  venueOptions,
  categoryOptions,
  activeVenue,
  activeCategory,
  activePriority,
  activeFromDate,
  activeToDate,
  onExportSubmit
}: {
  isOpen: boolean;
  onClose: () => void;
  records: CompletedRecord[];
  filteredRecords: CompletedRecord[];
  venueOptions: string[];
  categoryOptions: string[];
  activeVenue: string;
  activeCategory: string;
  activePriority: string;
  activeFromDate: string;
  activeToDate: string;
  onExportSubmit: (request: {
    reportType: "summary" | "attendance";
    scope: "filtered" | "all";
    format: "xlsx" | "pdf";
    venue: string;
    category: string;
    priority: string;
    fromDate: string;
    toDate: string;
  }) => void;
}) {
  const [reportType, setReportType] = useState<"summary" | "attendance">("summary");
  const [exportScope, setExportScope] = useState<"filtered" | "all">("filtered");
  const [exportVenue, setExportVenue] = useState(activeVenue);
  const [exportCategory, setExportCategory] = useState(activeCategory);
  const [exportPriority, setExportPriority] = useState(activePriority);
  const [exportFromDate, setExportFromDate] = useState(activeFromDate);
  const [exportToDate, setExportToDate] = useState(activeToDate);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) return null;

  let targetRecords = exportScope === "all" ? records : filteredRecords;
  if (exportVenue) targetRecords = targetRecords.filter((e) => e.venue === exportVenue);
  if (exportCategory) targetRecords = targetRecords.filter((e) => e.category === exportCategory);
  if (exportPriority) targetRecords = targetRecords.filter((e) => e.priorityLevel === exportPriority);
  if (exportFromDate) targetRecords = targetRecords.filter((e) => dateKey(e.startsAt ?? e.date) >= exportFromDate);
  if (exportToDate) targetRecords = targetRecords.filter((e) => dateKey(e.startsAt ?? e.date) <= exportToDate);

  function handleResetFilters() {
    setExportScope("filtered");
    setExportVenue("");
    setExportCategory("");
    setExportPriority("");
    setExportFromDate("");
    setExportToDate("");
  }

  function handleExport() {
    onExportSubmit({
      reportType,
      scope: exportScope,
      format: exportFormat,
      venue: exportVenue,
      category: exportCategory,
      priority: exportPriority,
      fromDate: exportFromDate,
      toDate: exportToDate
    });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-records-export-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
              <Download className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="event-records-export-modal-title" className="text-base font-bold text-slate-900">
                Export Event Records
              </h2>
              <p className="text-xs text-slate-500 font-medium">Select report type, scope criteria, and download format.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/60 bg-white text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close export modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Step 1: Report Content Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5 font-medium">
              1. Report Content
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  id: "summary",
                  title: "Event Summary Report",
                  desc: "High-level summary of completed events, schedules, venues & attendance rates.",
                  icon: FileDown
                },
                {
                  id: "attendance",
                  title: "Detailed Attendance Logs",
                  desc: "Participant-level check-in logs, arrival methods & tardiness reasons.",
                  icon: FileSpreadsheet
                }
              ].map((item) => {
                const ItemIcon = item.icon;
                const isSelected = reportType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setReportType(item.id as typeof reportType)}
                    className={\`relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all \${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                        : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }\`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={\`p-1.5 rounded-lg \${isSelected ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}\`}>
                        <ItemIcon className="h-4 w-4" />
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Scope & Filters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-medium">
                2. Scope & Filters
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-slate-500 hover:text-primary transition"
              >
                Reset filters
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Export Record Scope</label>
                <select
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value as "filtered" | "all")}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="filtered">Current Filtered Results ({filteredRecords.length} records)</option>
                  <option value="all">All Completed Event Records ({records.length} records)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Venue</label>
                  <select
                    value={exportVenue}
                    onChange={(e) => setExportVenue(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                  >
                    <option value="">All Venues</option>
                    {venueOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Category</label>
                  <select
                    value={exportCategory}
                    onChange={(e) => setExportCategory(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                  >
                    <option value="">All Categories</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Priority</label>
                  <select
                    value={exportPriority}
                    onChange={(e) => setExportPriority(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                  >
                    <option value="">All Priorities</option>
                    <option value="Time-Sensitive">Time-Sensitive</option>
                    <option value="Business-Critical">Business-Critical</option>
                    <option value="Flexible">Flexible</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Download Format Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 font-medium">
              3. Download Format
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat("xlsx")}
                className={\`flex items-center gap-3 rounded-xl border p-3 text-left transition-all \${
                  exportFormat === "xlsx"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                }\`}
              >
                <div className={\`p-2 rounded-lg \${exportFormat === "xlsx" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"}\`}>
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Spreadsheet (.XLSX)</p>
                  <p className="text-[10px] text-slate-500 font-normal">Excel workbook format</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("pdf")}
                className={\`flex items-center gap-3 rounded-xl border p-3 text-left transition-all \${
                  exportFormat === "pdf"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                }\`}
              >
                <div className={\`p-2 rounded-lg \${exportFormat === "pdf" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"}\`}>
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">PDF Document (.PDF)</p>
                  <p className="text-[10px] text-slate-500 font-normal">Printable formatted report</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {targetRecords.length} {targetRecords.length === 1 ? "Event Selected" : "Events Selected"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export {exportFormat.toUpperCase()}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
`;

content = content.replace("export function EventRecordsPage() {", `${modalComponentCode}\nexport function EventRecordsPage() {`);

// 3. Update state in EventRecordsPage
content = content.replace(
  "const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);",
  "const [isExportModalOpen, setIsExportModalOpen] = useState(false);"
);

// Remove exportMenuRef effect if present
const effectTarget = `  useEffect(() => {
    if (!isExportMenuOpen) return;
    const closeOnOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExportMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideInteraction);
    document.addEventListener("touchstart", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideInteraction);
      document.removeEventListener("touchstart", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isExportMenuOpen]);`;

content = content.replace(effectTarget, "");

// 4. Update the Export button click handler and remove old inline menu
const buttonTarget = `<div ref={exportMenuRef} className="relative">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="border-emerald-700 bg-emerald-700 text-white hover:border-emerald-800 hover:bg-emerald-800"
                  aria-expanded={isExportMenuOpen}
                  aria-controls="event-record-export-menu"
                  onClick={() => setIsExportMenuOpen((open) => !open)}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export
                </Button>
                {isExportMenuOpen ? (
                  <div id="event-record-export-menu" role="menu" className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
                    <div className="border-b bg-muted/30 px-3 py-2.5">
                      <p className="text-sm font-semibold text-foreground">Download reports</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Choose which event records to include.</p>
                      <label className="mt-2 block">
                        <span className="sr-only">Records to export</span>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          value={exportScope}
                          onChange={(event) => setExportScope(event.target.value as "filtered" | "all")}
                        >
                          <option value="filtered">Current results ({pastEvents.length})</option>
                          <option value="all">All completed events ({completedRows.length})</option>
                        </select>
                      </label>
                    </div>
                    <div className="divide-y divide-border">
                      <ReportExportRow icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />} label="Attendance" onExportXlsx={() => { exportAllAttendanceReport("Attendance Report XLSX", exportEvents); setIsExportMenuOpen(false); }} onExportPdf={() => { exportAllAttendanceReport("Attendance Report PDF", exportEvents); setIsExportMenuOpen(false); }} />
                      <ReportExportRow icon={<FileDown className="h-3.5 w-3.5" aria-hidden="true" />} label="Event summary" onExportXlsx={() => { exportReport("Event Summary Report XLSX", exportEvents); setIsExportMenuOpen(false); }} onExportPdf={() => { exportReport("Event Summary Report PDF", exportEvents); setIsExportMenuOpen(false); }} />
                    </div>
                  </div>
                ) : null}
              </div>`;

const buttonReplacement = `<Button
                type="button"
                variant="default"
                size="sm"
                className="border-primary bg-primary text-white hover:bg-primary/90 shadow-xs"
                onClick={() => setIsExportModalOpen(true)}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </Button>`;

content = content.replace(buttonTarget, buttonReplacement);

// 5. Add handleExportModalSubmit handler and modal render call before return in EventRecordsPage
const endOfPageTarget = `{completedModal ? (
        <CompletedEventModal`;

const modalRenderReplacement = `
      <EventRecordsExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        records={completedRows}
        filteredRecords={pastEvents}
        venueOptions={venueOptions}
        categoryOptions={categoryOptions}
        activeVenue={venueFilter}
        activeCategory={categoryFilter}
        activePriority={priorityFilter}
        activeFromDate={fromDate}
        activeToDate={toDate}
        onExportSubmit={(req) => {
          let targetEvents = req.scope === "all" ? completedRows : pastEvents;
          if (req.venue) targetEvents = targetEvents.filter((e) => e.venue === req.venue);
          if (req.category) targetEvents = targetEvents.filter((e) => e.category === req.category);
          if (req.priority) targetEvents = targetEvents.filter((e) => e.priorityLevel === req.priority);
          if (req.fromDate) targetEvents = targetEvents.filter((e) => dateKey(e.startsAt ?? e.date) >= req.fromDate);
          if (req.toDate) targetEvents = targetEvents.filter((e) => dateKey(e.startsAt ?? e.date) <= req.toDate);

          if (targetEvents.length === 0) {
            toast.warning("No completed event records match the selected export criteria.");
            return;
          }

          const label = req.reportType === "summary" ? "Event Summary Report" : "Attendance Report";
          if (req.reportType === "summary") {
            if (req.format === "xlsx") exportReport(\`\${label} XLSX\`, targetEvents);
            else exportReport(\`\${label} PDF\`, targetEvents);
          } else {
            if (req.format === "xlsx") exportAllAttendanceReport(\`\${label} XLSX\`, targetEvents);
            else exportAllAttendanceReport(\`\${label} PDF\`, targetEvents);
          }
        }}
      />

      {completedModal ? (
        <CompletedEventModal`;

content = content.replace(endOfPageTarget, modalRenderReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated EventRecordsPage.tsx with Export Modal!');
