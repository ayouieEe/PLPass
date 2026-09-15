const fs = require('fs');
const path = 'c:/Users/PLPASIG/Documents/Github/PLPass/src/features/organizer/pages/EventRecordsPage.tsx';

let content = fs.readFileSync(path, 'utf8');

// 1. Remove the old useEffect that referenced isExportMenuOpen
const oldEffect = `  useEffect(() => {
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

content = content.replace(oldEffect, "");

// 2. Remove any remaining references to isExportMenuOpen in EventRecordsPage
const oldMenuBlock = `<div ref={exportMenuRef} className="relative">
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

const newButtonBlock = `<Button
                type="button"
                variant="default"
                size="sm"
                className="border-primary bg-primary text-white hover:bg-primary/90 shadow-xs"
                onClick={() => setIsExportModalOpen(true)}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </Button>`;

content = content.replace(oldMenuBlock, newButtonBlock);

// 3. Make sure const [isExportModalOpen, setIsExportModalOpen] = useState(false); is defined in EventRecordsPage
if (!content.includes('const [isExportModalOpen, setIsExportModalOpen] = useState(false);')) {
  content = content.replace(
    'const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);',
    'const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);\n  const [isExportModalOpen, setIsExportModalOpen] = useState(false);'
  );
}

fs.writeFileSync(path, content, 'utf8');
console.log('Cleaned up EventRecordsPage.tsx successfully');
