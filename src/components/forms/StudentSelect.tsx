import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  id?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
};

export function StudentSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  className = "",
  disabled = false,
  id,
  ariaInvalid,
  ariaDescribedBy
}: StudentSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const selectId = id ?? `student-select-${generatedId.replace(/:/g, "")}`;
  const listboxId = `${selectId}-listbox`;

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

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => {
      const optionsInMenu = containerRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
      const selected = containerRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      (selected ?? optionsInMenu?.[0])?.focus();
    });
  }, [isOpen]);

  const handleSelect = (val: string) => {
    if (disabled) return;
    onChange(val);
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!isOpen || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const optionElements = [...(containerRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (!optionElements.length) return;
    event.preventDefault();
    const currentIndex = optionElements.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? optionElements.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + optionElements.length) % optionElements.length
          : (currentIndex - 1 + optionElements.length) % optionElements.length;
    optionElements[nextIndex].focus();
  }

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} className={`relative w-full ${isOpen ? "z-50" : "z-10"} ${className}`}>
      <button
        id={selectId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key) && !isOpen && !disabled) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        data-open={isOpen ? "true" : undefined}
        className="student-select-trigger flex h-11 w-full items-center justify-between border px-3 text-sm font-medium transition-all duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown aria-hidden="true" className={`h-4.5 w-4.5 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div id={listboxId} role="listbox" aria-labelledby={selectId} className="student-select-menu absolute left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto border p-1.5 backdrop-blur-xl animate-in fade-in-50 slide-in-from-top-2 duration-150">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">No options available</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected || (!selectedOption && option === options[0]) ? 0 : -1}
                  onClick={() => handleSelect(option.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-all duration-150 student-select-option ${
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-primary/5 hover:text-primary-hover"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check aria-hidden="true" className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
