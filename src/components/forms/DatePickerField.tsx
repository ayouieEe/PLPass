import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { fieldBaseClass, fieldErrorClass, labelClass } from "@/components/forms/fieldStyles";

type DatePickerFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  disabled?: boolean;
  min?: string;
};

export function DatePickerField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  disabled,
  min,
}: DatePickerFieldProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
          const nextValue = event.target.value;

          if (min && nextValue) {
            const selectedDate = new Date(`${nextValue}T00:00:00`);
            const minimumDate = new Date(`${min}T00:00:00`);

            if (selectedDate < minimumDate) {
              field.onChange("");
              return;
            }
          }

          field.onChange(nextValue);
        };

        return (
          <label className="space-y-1.5">
            <span className={labelClass}>{label}</span>
            <input
              {...field}
              className={fieldBaseClass}
              type="date"
              disabled={disabled}
              min={min}
              onChange={handleChange}
            />
            {fieldState.error ? <p className={fieldErrorClass}>{fieldState.error.message}</p> : null}
          </label>
        );
      }}
    />
  );
}
