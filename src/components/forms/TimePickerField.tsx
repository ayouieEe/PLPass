import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TimePickerFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  disabled?: boolean;
  required?: boolean;
  optional?: boolean;
};

export function TimePickerField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  disabled,
  required = false,
  optional = false
}: TimePickerFieldProps<TFieldValues>) {
  const errorId = `field-error-${useId().replace(/:/g, "")}`;
  const requiredMarker = required ? <span aria-hidden="true" className="ml-1 text-danger">*</span> : null;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}{requiredMarker}</span>
          <input
            {...field}
            className={fieldBaseClass}
            type="time"
            disabled={disabled}
            required={required}
            aria-invalid={Boolean(fieldState.error)}
            aria-required={required}
            aria-describedby={fieldState.error ? errorId : undefined}
          />
          {fieldState.error ? <p id={errorId} role="alert" className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
