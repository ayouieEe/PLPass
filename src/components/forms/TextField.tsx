import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TextFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number" | "tel";
  min?: number;
  max?: number;
  step?: number;
  minError?: string;
  maxError?: string;
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
  min,
  max,
  step,
  minError,
  maxError,
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

        const numericRangeError = type === "number" && typeof field.value === "number"
          ? min !== undefined && field.value < min
            ? minError ?? `Value must be at least ${min}.`
            : max !== undefined && field.value > max
              ? maxError ?? `Value must not exceed ${max}.`
              : undefined
          : undefined;
        const errorMessage = numericRangeError ?? fieldState.error?.message;

        return (
          <label className="space-y-1.5">
            <span className={labelClass}>{label}</span>
            <input
              {...field}
              value={field.value ?? ""}
              className={`${fieldBaseClass} ${className ?? ""}`}
              type={type}
              placeholder={placeholder}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              readOnly={readOnly}
              onChange={handleChange}
            />
            {errorMessage ? <p className={fieldErrorClass}>{errorMessage}</p> : null}
          </label>
        );
      }}
    />
  );
}
