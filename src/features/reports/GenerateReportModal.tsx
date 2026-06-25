import { FormModal } from "@/components/modals/FormModal";
import { Button } from "@/components/ui/button";

type GenerateReportModalProps = {
  open: boolean;
  reportName: string;
  onClose: () => void;
  onGenerate: () => void;
};

export function GenerateReportModal({ open, reportName, onClose, onGenerate }: GenerateReportModalProps) {
  return (
    <FormModal open={open} title="Generate report" description="Preview configuration before creating the report." submitLabel="Generate" onClose={onClose} onSubmit={onGenerate}>
      <div className="rounded-md bg-highlight p-4 text-highlight-foreground">
        <p className="text-sm font-medium">{reportName}</p>
        <p className="mt-1 text-sm">This phase uses temporary sample data only.</p>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Review filters
        </Button>
      </div>
    </FormModal>
  );
}
