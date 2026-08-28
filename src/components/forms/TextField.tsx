import { useId } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TextFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  helperText?: string;
  type?: "text" | "email" | "password" | "number" | "tel";
  min?: number;
  max?: number;
  onInvalidNumber?: (value: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
};

export function TextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  helperText,
  type = "text",
  min,
  max,
  onInvalidNumber,
  disabled,
  readOnly,
  className
}: TextFieldProps<TFieldValues>) {
  const errorId = `field-error-${useId().replace(/:/g, "")}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
          const rawValue = event.target.value;

          if (type === "number") {
            if (rawValue === "") {
              field.onChange(null);
              return;
            }

            const numericValue = Number(rawValue);
            if (!Number.isFinite(numericValue)) {
              return;
            }

            const boundedValue = Math.max(min ?? numericValue, Math.min(max ?? numericValue, numericValue));
            if (boundedValue !== numericValue) {
              onInvalidNumber?.(numericValue);
            }
            field.onChange(boundedValue);
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
              min={min}
              max={max}
              disabled={disabled}
              readOnly={readOnly}
              onChange={handleChange}
              aria-invalid={Boolean(fieldState.error)}
              aria-describedby={fieldState.error ? errorId : undefined}
            />
            {helperText && !fieldState.error ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
            {fieldState.error ? <p id={errorId} role="alert" className={fieldErrorClass}>{fieldState.error.message}</p> : null}
          </label>
        );
      }}
    />
  );
}
