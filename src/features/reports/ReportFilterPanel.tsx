import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";

type ReportFilterPanelProps = {
  query: string;
  period: string;
  onQueryChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  onApply: () => void;
};

export function ReportFilterPanel({ query, period, onQueryChange, onPeriodChange, onApply }: ReportFilterPanelProps) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
        <SearchInput value={query} placeholder="Search report scope" onChange={onQueryChange} />
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Period</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" value={period} onChange={(event) => onPeriodChange(event.target.value)}>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="term">Current term</option>
          </select>
        </label>
        <Button type="button" onClick={onApply}>
          Apply
        </Button>
      </div>
    </section>
  );
}
