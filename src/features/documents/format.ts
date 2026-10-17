export function formatUpdatedAt(isoDate: string, locale?: string) {
  return new Date(isoDate).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPageCount(pageCount: number) {
  return pageCount === 1 ? '1 page' : `${pageCount} pages`;
}
