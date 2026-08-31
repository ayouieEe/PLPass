import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type DatePickerFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  disabled?: boolean;
  min?: string;
  required?: boolean;
};

export function DatePickerField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  disabled,
  min,
  required = false,
}: DatePickerFieldProps<TFieldValues>) {
  const errorId = `field-error-${useId().replace(/:/g, "")}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
          const nextValue = event.target.value;

          if (min && nextValue) {
            const selectedDate = new Date(`${nextValue}T00:00:00`);
            const minimumDate = new Date(`${min}T00:00:00`);

            if (selectedDate < minimumDate) {
              field.onChange("");
              return;
            }
          }

          field.onChange(nextValue);
        };

        return (
          <label className="space-y-1.5">
            <span className={labelClass}>
              {label}
              {required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}
            </span>
            <input
              {...field}
              className={fieldBaseClass}
              type="date"
              disabled={disabled}
              min={min}
              aria-required={required || undefined}
              onChange={handleChange}
              aria-invalid={Boolean(fieldState.error)}
              aria-describedby={fieldState.error ? errorId : undefined}
            />
            {fieldState.error ? <p id={errorId} role="alert" className={fieldErrorClass}>{fieldState.error.message}</p> : null}
          </label>
        );
      }}
    />
  );
}
