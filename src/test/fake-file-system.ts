// Test-only stand-in for the parts of `expo-file-system` (File, Directory, Paths) that
// src/lib/files uses. Use with `jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'))`.

const DOCUMENT_ROOT = 'file:///data/app/files';
const files = new Map<string, string>();
const directories = new Set<string>();

type Base = string | { uri: string };

function join(base: Base, parts: string[]): string {
  const root = typeof base === 'string' ? base : base.uri;
  return [root.replace(/\/+$/, ''), ...parts].join('/');
}

export class Directory {
  readonly uri: string;

  constructor(base: Base, ...parts: string[]) {
    this.uri = join(base, parts);
  }

  get exists() {
    return directories.has(this.uri);
  }

  create(options: { intermediates?: boolean; idempotent?: boolean } = {}) {
    if (this.exists && !options.idempotent) throw new Error(`Directory exists: ${this.uri}`);
    const parent = this.uri.slice(0, this.uri.lastIndexOf('/'));
    if (!options.intermediates && parent !== DOCUMENT_ROOT && !directories.has(parent)) {
      throw new Error(`Parent missing: ${parent}`);
    }
    // Like the real API, `intermediates` creates every missing parent below the document root.
    let current = this.uri;
    while (current.startsWith(`${DOCUMENT_ROOT}/`)) {
      directories.add(current);
      current = current.slice(0, current.lastIndexOf('/'));
    }
  }

  delete() {
    if (!this.exists) throw new Error(`Directory missing: ${this.uri}`);
    for (const uri of [...files.keys()]) if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
    for (const uri of [...directories]) {
      if (uri === this.uri || uri.startsWith(`${this.uri}/`)) directories.delete(uri);
    }
  }
}

export class File {
  readonly uri: string;

  constructor(base: Base, ...parts: string[]) {
    this.uri = join(base, parts);
  }

  get exists() {
    return files.has(this.uri);
  }

  /** Like the real API: 0 when the file is missing. */
  get size() {
    return files.get(this.uri)?.length ?? 0;
  }

  async copy(destination: File, options: { overwrite?: boolean } = {}) {
    const content = files.get(this.uri);
    if (content === undefined) throw new Error(`Source missing: ${this.uri}`);
    if (destination.exists && !options.overwrite)
      throw new Error(`Destination exists: ${destination.uri}`);
    files.set(destination.uri, content);
  }

  delete() {
    if (!this.exists) throw new Error(`File missing: ${this.uri}`);
    files.delete(this.uri);
  }
}

export const Paths = {
  get document() {
    return new Directory(DOCUMENT_ROOT);
  },
};

/** Helpers for tests: seed source files and inspect what was written. */
export const fakeFileSystem = {
  documentRoot: DOCUMENT_ROOT,
  reset() {
    files.clear();
    directories.clear();
  },
  addFile(uri: string, content = 'bytes') {
    files.set(uri, content);
  },
  files() {
    return [...files.keys()].sort();
  },
};
