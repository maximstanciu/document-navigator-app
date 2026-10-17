export type DocumentSummary = {
  id: string;
  title: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
  pageCount: number;
};

export type DocumentDetail = DocumentSummary & {
  body: string;
  tags: string[];
};
