import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TextFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number" | "tel";
  disabled?: boolean;
};

export function TextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type = "text",
  disabled
}: TextFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}</span>
          <input {...field} className={fieldBaseClass} type={type} placeholder={placeholder} disabled={disabled} />
          {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
