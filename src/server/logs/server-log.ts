// Server logs carry metadata only (SPEC §7.1): never a title, a file name, a quote, a model answer
// or an error message — any of them can hold content of the document. EAS Hosting keeps
// console.info output on the deployment's Logs page, one JSON object per line.

/** A log event: a name and flat fields with numbers, flags and closed sets of words. */
export type LogEvent = { event: string } & Record<string, string | number | boolean | null>;

export type ServerLog = (event: LogEvent) => void;

export const consoleServerLog: ServerLog = (event) => {
  console.info(JSON.stringify(event));
};

/**
 * An error to rethrow for the runtime's crash report: the same name and stack frames, without the
 * message. Messages can quote input — `JSON.parse` does, for one — and crash reports show them.
 */
export function redactError(error: unknown): Error {
  const name = error instanceof Error ? error.name : typeof error;
  const redacted = new Error('[message redacted]');
  redacted.name = name;
  const frames =
    error instanceof Error ? (error.stack?.split('\n').filter(isStackFrame) ?? []) : [];
  redacted.stack = [`${name}: [message redacted]`, ...frames].join('\n');
  return redacted;
}

function isStackFrame(line: string) {
  return /^\s+at\s/.test(line);
}
