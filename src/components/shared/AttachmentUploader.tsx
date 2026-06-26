import { Upload } from "lucide-react";

type AttachmentUploaderProps = {
  label?: string;
  accept?: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
};

export function AttachmentUploader({ label = "Upload attachments", accept, multiple, onFilesSelected }: AttachmentUploaderProps) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-input bg-surface p-6 text-center transition-colors hover:border-primary-hover hover:bg-surface-muted">
      <Upload className="mb-2 h-6 w-6 text-brand-green-primary" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
      <span className="mt-1 text-xs text-muted-foreground">Choose files from your device</span>
      <input
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => onFilesSelected(Array.from(event.target.files ?? []))}
      />
    </label>
  );
}
