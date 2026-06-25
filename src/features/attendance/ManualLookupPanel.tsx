import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";

type ManualLookupPanelProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onMarkPresent: () => void;
};

export function ManualLookupPanel({ query, onQueryChange, onMarkPresent }: ManualLookupPanelProps) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <h2 className="font-semibold">Manual fallback</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use only when NFC is unavailable or a credential needs review.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={query} placeholder="Find student" onChange={onQueryChange} />
        <Button type="button" onClick={onMarkPresent}>
          Mark present
        </Button>
      </div>
    </section>
  );
}
