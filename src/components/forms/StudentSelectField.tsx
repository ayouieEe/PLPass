import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { StudentSelect } from "./StudentSelect";

type StudentSelectFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  disabled?: boolean;
};

export function StudentSelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  disabled
}: StudentSelectFieldProps<TFieldValues>) {
  const fieldId = `student-select-field-${useId().replace(/:/g, "")}`;
  const errorId = `${fieldId}-error`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="block text-xs font-semibold text-foreground">{label}</label>
          <StudentSelect
            id={fieldId}
            value={field.value}
            onChange={field.onChange}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            ariaInvalid={Boolean(fieldState.error)}
            ariaDescribedBy={fieldState.error ? errorId : undefined}
          />
          {fieldState.error ? <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">{fieldState.error.message}</p> : null}
        </div>
      )}
    />
  );
}
