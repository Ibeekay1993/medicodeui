import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export function useDataPagination<T>(items: T[], mobilePageSize = 30, desktopPageSize = 50) {
  const isMobile = useIsMobile();
  const pageSize = isMobile ? mobilePageSize : desktopPageSize;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  useEffect(() => {
    setPage(current => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const start = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, items.length);

  return { page, setPage, pageSize, totalPages, pageItems, start, end, total: items.length };
}
