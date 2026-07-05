import { ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type FilterOption = {
  label: string;
  value: string;
};

type FilterBarProps = {
  search: string;
  filters: FilterOption[];
  selectedFilter: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
};

export function FilterBar({ search, filters, selectedFilter, onSearchChange, onFilterChange }: FilterBarProps) {
  const defaultFilter = filters[0]?.value ?? "";
  const canClear = Boolean(search.trim()) || (selectedFilter && selectedFilter !== defaultFilter);

  const handleClear = () => {
    onSearchChange("");
    if (defaultFilter) {
      onFilterChange(defaultFilter);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label className="relative min-w-0 flex-1 xl:max-w-sm">
          <span className="sr-only">Search records</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            className="plpass-field h-12 w-full rounded-lg border bg-surface pl-11 pr-3 text-sm outline-none"
            value={search}
            placeholder="Search records"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:flex-nowrap">
          {filters.length ? (
            <label className="relative inline-flex min-w-44 items-center">
              <span className="sr-only">Filter records</span>
              <select
                value={selectedFilter || defaultFilter}
                onChange={(event) => onFilterChange(event.target.value)}
                className="plpass-field h-12 w-full appearance-none rounded-lg border bg-surface py-0 pl-4 pr-10 text-sm font-medium outline-none"
              >
                {filters.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </label>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-lg px-4"
            disabled={!canClear}
            onClick={handleClear}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
