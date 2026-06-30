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
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-foreground">{label}</label>
          <StudentSelect
            value={field.value}
            onChange={field.onChange}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
          />
          {fieldState.error ? <p className="mt-1 text-xs font-medium text-danger">{fieldState.error.message}</p> : null}
        </div>
      )}
    />
  );
}
