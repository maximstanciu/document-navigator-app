// Lets Node run the eval's TypeScript and the server code it reuses (src/server, src/shared) without
// a build step or a new dependency: `node --import ./scripts/eval/register-ts.mjs <file>.ts`.
// Resolves the `@/` alias and extensionless imports as Metro does, and turns TypeScript into
// JavaScript with Node's own transform (`stripTypeScriptTypes`, Node 22.13+).
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../../src/', import.meta.url);
const TYPESCRIPT = /\.tsx?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromTypeScript = TYPESCRIPT.test(context.parentURL ?? '');
    const base = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), SRC)
      : specifier.startsWith('.') && fromTypeScript
        ? new URL(specifier, context.parentURL)
        : null;
    if (base) {
      for (const extension of ['', '.ts', '.tsx']) {
        const url = new URL(base.href + extension);
        if (TYPESCRIPT.test(url.pathname) && existsSync(url)) {
          return { url: url.href, format: 'module', shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !TYPESCRIPT.test(url)) return nextLoad(url, context);
    const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), {
      mode: 'transform',
      sourceUrl: url,
    });
    return { format: 'module', source, shortCircuit: true };
  },
});
