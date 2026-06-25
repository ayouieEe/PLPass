import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportButtonsProps = {
  onExportCsv?: () => void;
  onExportPdf?: () => void;
};

export function ExportButtons({ onExportCsv, onExportPdf }: ExportButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onExportPdf}>
        <Download className="h-4 w-4" aria-hidden="true" />
        PDF
      </Button>
    </div>
  );
}
