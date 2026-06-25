import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type FileUploadFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  accept?: string;
  multiple?: boolean;
};

export function FileUploadField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  accept,
  multiple
}: FileUploadFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, name: fieldName, ref }, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}</span>
          <input
            ref={ref}
            name={fieldName}
            className="plpass-field block h-auto w-full rounded-md border p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(event) => onChange(multiple ? Array.from(event.target.files ?? []) : event.target.files?.[0])}
          />
          {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
