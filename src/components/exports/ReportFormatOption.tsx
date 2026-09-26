import { FileSpreadsheet, FileText } from "lucide-react";

export type ReportDownloadFormat = "xlsx" | "pdf";

type ReportFormatOptionProps = {
  format: ReportDownloadFormat;
  selectedFormat: ReportDownloadFormat;
  onSelect: (format: ReportDownloadFormat) => void;
  description: string;
};

const formatDetails = {
  xlsx: { label: "Spreadsheet (.XLSX)", Icon: FileSpreadsheet },
  pdf: { label: "PDF Document (.PDF)", Icon: FileText }
} as const;

/** Consistent, theme-aware XLSX/PDF selection control for report dialogs. */
export function ReportFormatOption({ format, selectedFormat, onSelect, description }: ReportFormatOptionProps) {
  const selected = format === selectedFormat;
  const { label, Icon } = formatDetails[format];

  return (
    <button type="button" onClick={() => onSelect(format)} aria-pressed={selected} data-selected={selected ? "true" : "false"} className="plpass-report-format-option">
      <span className="plpass-report-format-option-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-xs font-bold">{label}</span>
        <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{description}</span>
      </span>
      {selected ? <span className="plpass-report-format-option-badge">Selected</span> : null}
    </button>
  );
}
