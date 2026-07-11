import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";

type Option = {
  label: string;
  value: string;
};

type StudentSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function StudentSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  className = "",
  disabled = false
}: StudentSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (val: string) => {
    if (disabled) return;
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen ? "z-50" : "z-10"} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        data-open={isOpen ? "true" : undefined}
        className="student-select-trigger flex h-11 w-full items-center justify-between border px-3 text-sm font-medium transition-all duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={`h-4.5 w-4.5 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="student-select-menu absolute left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto border p-1.5 backdrop-blur-xl animate-in fade-in-50 slide-in-from-top-2 duration-150">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">No options available</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-150 student-select-option ${
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-primary/5 hover:text-primary-hover"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
