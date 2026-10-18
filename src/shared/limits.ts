// Document limits (CAP-7, SPEC §1.5): the client checks them before upload, the server enforces them.

/** Pages per document. The client can't count PDF pages, so for PDF the server checks this (D-4). */
export const MAX_DOCUMENT_PAGES = 30;

/**
 * Total size of a document's files: 20 MB passed spike 0.2. Drops to 10 MB if the analyze handler
 * can't keep memory within three file sizes (SPEC §7.1, task 3.1).
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
