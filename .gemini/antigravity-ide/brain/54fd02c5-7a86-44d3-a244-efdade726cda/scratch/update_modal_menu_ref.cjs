const fs = require('fs');
const path = 'c:/Users/PLPASIG/Documents/Github/PLPass/src/features/organizer/pages/EventRecordsPage.tsx';

let content = fs.readFileSync(path, 'utf8');

const targetStr = `export function CompletedEventModal({
  record,
  rows,
  onClose,
  onExportReport,
  onExportAttendanceReport
}: {
  record: CompletedRecord;
  rows: AttendanceRow[];
  onClose: () => void;
  onExportReport?: (label: string) => void;
  onExportAttendanceReport?: (label: string, rows: AttendanceRow[]) => void;
}) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);`;

const replacementStr = `export function CompletedEventModal({
  record,
  rows,
  onClose,
  onExportReport,
  onExportAttendanceReport
}: {
  record: CompletedRecord;
  rows: AttendanceRow[];
  onClose: () => void;
  onExportReport?: (label: string) => void;
  onExportAttendanceReport?: (label: string, rows: AttendanceRow[]) => void;
}) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const closeOnOutside = (e: MouseEvent | TouchEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, [isExportMenuOpen]);`;

content = content.replace(targetStr, replacementStr);

const menuWrapperTarget = `<div className="relative">
              <Button type="button" size="sm" onClick={() => setIsExportMenuOpen((open) => !open)} aria-expanded={isExportMenuOpen}>`;

const menuWrapperReplacement = `<div ref={exportMenuRef} className="relative">
              <Button type="button" size="sm" onClick={() => setIsExportMenuOpen((open) => !open)} aria-expanded={isExportMenuOpen}>`;

content = content.replace(menuWrapperTarget, menuWrapperReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated CompletedEventModal in EventRecordsPage.tsx');
