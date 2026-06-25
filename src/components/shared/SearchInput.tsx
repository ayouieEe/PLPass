import { Search } from "lucide-react";

type SearchInputProps = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function SearchInput({ value, placeholder = "Search", onChange }: SearchInputProps) {
  return (
    <label className="relative block min-w-64">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        className="plpass-field h-10 w-full rounded-md border pl-9 pr-3 text-sm outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
