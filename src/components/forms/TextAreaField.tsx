import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TextAreaFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
};

export function TextAreaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  rows = 4,
  disabled
}: TextAreaFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}</span>
          <textarea
            {...field}
            className="plpass-field w-full rounded-md border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
          />
          {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
