import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TextFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number" | "tel";
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
};

export function TextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type = "text",
  disabled,
  readOnly,
  className
}: TextFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
          const rawValue = event.target.value;

          if (type === "number") {
            field.onChange(rawValue === "" ? null : Number(rawValue));
            return;
          }

          field.onChange(rawValue);
        };

        return (
          <label className="space-y-1.5">
            <span className={labelClass}>{label}</span>
            <input
              {...field}
              value={field.value ?? ""}
              className={`${fieldBaseClass} ${className ?? ""}`}
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              onChange={handleChange}
            />
            {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
          </label>
        );
      }}
    />
  );
}
