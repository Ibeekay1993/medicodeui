import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataPaginationProps = {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function DataPagination({
  page,
  totalPages,
  start,
  end,
  total,
  pageSize,
  onPageChange,
  className
}: DataPaginationProps) {
  if (total <= pageSize) return null;

  return (
    <div className={cn("flex flex-col gap-2 border-t border-slate-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
        Showing {start}-{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="h-7 rounded-lg px-3 text-xs font-black uppercase"
        >
          Prev
        </Button>
        <span className="min-w-16 text-center text-xs font-black uppercase text-slate-500">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="h-7 rounded-lg px-3 text-xs font-black uppercase"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
