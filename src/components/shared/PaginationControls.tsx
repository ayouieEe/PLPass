import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  pageIndex: number;
  pageCount: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function PaginationControls({
  pageIndex,
  pageCount,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page <span className="font-medium text-foreground">{pageIndex + 1}</span> of{" "}
        <span className="font-medium text-foreground">{Math.max(pageCount, 1)}</span>
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canPreviousPage} onClick={onPreviousPage}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canNextPage} onClick={onNextPage}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
