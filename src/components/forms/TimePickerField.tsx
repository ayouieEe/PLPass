import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type TimePickerFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  disabled?: boolean;
};

export function TimePickerField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  disabled
}: TimePickerFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <label className="space-y-1.5">
          <span className={labelClass}>{label}</span>
          <input {...field} className={fieldBaseClass} type="time" disabled={disabled} />
          {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
        </label>
      )}
    />
  );
}
