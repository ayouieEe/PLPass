import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type SelectOption = {
  label: string;
  value: string;
};

type SelectFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = "Select an option",
  disabled,
  required = false
}: SelectFieldProps<TFieldValues>) {
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
          <select {...field} className="plpass-select h-10 rounded-md" disabled={disabled} aria-required={required || undefined} aria-invalid={Boolean(fieldState.error)} aria-describedby={fieldState.error ? errorId : undefined}>
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldState.error ? <p id={errorId} role="alert" className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
