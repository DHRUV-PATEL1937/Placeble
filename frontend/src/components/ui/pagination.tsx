import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total?: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return <nav className="app-pagination" aria-label="Pagination"><span>{total === undefined ? `Page ${page} of ${pages}` : `${total.toLocaleString()} results`}</span><div><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>{start > 1 && <><button type="button" onClick={() => onChange(1)}>1</button>{start > 2 && <em>…</em>}</>}{numbers.map(number => <button type="button" className={number === page ? "active" : ""} aria-current={number === page ? "page" : undefined} key={number} onClick={() => onChange(number)}>{number}</button>)}{end < pages && <>{end < pages - 1 && <em>…</em>}<button type="button" onClick={() => onChange(pages)}>{pages}</button></>}<button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div></nav>;
}
