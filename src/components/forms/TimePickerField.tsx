import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TimePickerFieldProps<TFieldValues extends FieldValues = any> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  disabled?: boolean;
  required?: boolean;
};

export function TimePickerField<TFieldValues extends FieldValues = any>({
  control,
  name,
  label,
  disabled,
  required = false
}: TimePickerFieldProps<TFieldValues>) {
  const errorId = `field-error-${useId().replace(/:/g, "")}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>
            {label}
            {required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}
          </span>
          <input {...field} className={fieldBaseClass} type="time" disabled={disabled} required={required} aria-invalid={Boolean(fieldState.error)} aria-describedby={fieldState.error ? errorId : undefined} />
          {fieldState.error ? <p id={errorId} role="alert" className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
