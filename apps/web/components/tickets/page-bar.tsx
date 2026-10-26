import { type PageQuery, pageCount } from '@debus/contracts';
import { TablePagination } from '@/components/data/table-pagination';

interface PageBarProps {
  query: PageQuery;
  total: number;
  // How many items the current page shows.
  shown: number;
  onChange: (patch: Partial<PageQuery>) => void;
}

// The pagination bar of the tables, under a list of cards whose page lives in the address.
export function PageBar({ query, total, shown, onChange }: PageBarProps) {
  const pages = pageCount(total, query.pageSize);
  const before = (query.page - 1) * query.pageSize;
  return (
    <TablePagination
      page={query.page}
      pageCount={pages}
      pageSize={query.pageSize}
      total={total}
      from={before + 1}
      to={before + shown}
      canPrevious={query.page > 1}
      canNext={query.page < pages}
      onFirst={() => onChange({ page: 1 })}
      onPrevious={() => onChange({ page: query.page - 1 })}
      onNext={() => onChange({ page: query.page + 1 })}
      onLast={() => onChange({ page: pages })}
      onPageSizeChange={(pageSize) => onChange({ pageSize })}
    />
  );
}
