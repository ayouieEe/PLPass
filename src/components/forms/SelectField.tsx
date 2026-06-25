import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

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
};

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = "Select an option",
  disabled
}: SelectFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}</span>
          <select {...field} className={fieldBaseClass} disabled={disabled}>
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
