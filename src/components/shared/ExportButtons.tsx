import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportButtonsProps = {
  onExportXlsx?: () => void;
  onExportPdf?: () => void;
  disabled?: boolean;
  title?: string;
};

export function ExportButtons({ onExportXlsx, onExportPdf, disabled = false, title }: ExportButtonsProps) {
  const xlsxDisabled = disabled || !onExportXlsx;
  const pdfDisabled = disabled || !onExportPdf;
  const disabledTitle = title ?? "Export generation requires backend support";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Export</span>
      <Button
        type="button"
        size="sm"
        className="rounded-lg bg-primary px-4 text-primary-foreground shadow-sm hover:bg-primary-hover"
        disabled={xlsxDisabled}
        title={xlsxDisabled ? disabledTitle : "Export XLSX"}
        onClick={onExportXlsx}
      >
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        XLSX
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="rounded-lg px-4 shadow-sm"
        disabled={pdfDisabled}
        title={pdfDisabled ? disabledTitle : "Export PDF"}
        onClick={onExportPdf}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        PDF
      </Button>
    </div>
  );
}
