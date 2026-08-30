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
  optional?: boolean;
};

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = "Select an option",
  disabled,
  required = false,
  optional = false
}: SelectFieldProps<TFieldValues>) {
  const errorId = `field-error-${useId().replace(/:/g, "")}`;
  const requiredMarker = required ? <span aria-hidden="true" className="ml-1 text-danger">*</span> : null;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}{requiredMarker}</span>
          <select
            {...field}
            className="plpass-select h-10 rounded-md"
            disabled={disabled}
            required={required}
            aria-invalid={Boolean(fieldState.error)}
            aria-required={required}
            aria-describedby={fieldState.error ? errorId : undefined}
          >
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
