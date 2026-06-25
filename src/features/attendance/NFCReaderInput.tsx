import { KeyboardEvent } from "react";

type NFCReaderInputProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export function NFCReaderInput({ value, disabled, onChange, onSubmit }: NFCReaderInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit(value);
    }
  }

  return (
    <label className="block rounded-lg border bg-surface p-4">
      <span className="text-sm font-medium">NFC reader input</span>
      <input
        className="plpass-field mt-2 h-12 w-full rounded-md border px-3 text-lg outline-none"
        value={value}
        disabled={disabled}
        autoComplete="off"
        placeholder="Tap school ID sticker"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="mt-2 block text-xs text-muted-foreground">USB NFC readers type into this field and send Enter.</span>
    </label>
  );
}
