import { SearchInput } from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

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
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-surface p-3 md:flex-row md:items-center md:justify-between">
      <SearchInput value={search} placeholder="Search records" onChange={onSearchChange} />
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant="outline"
            size="sm"
            className={cn(selectedFilter === filter.value && "plpass-filter-selected")}
            onClick={() => onFilterChange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
