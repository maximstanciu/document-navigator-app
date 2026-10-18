#!/usr/bin/env node
// Plan task 1.9 / SPEC §8.2: names of server-only environment variables (LLM keys and settings)
// must never reach a client bundle. Scans an `npx expo export` output directory, skipping the
// server output (API routes legitimately read these variables).
//
// Usage: node scripts/check-client-bundle.mjs [dist]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// No leading \b: Hermes bytecode stores strings back to back, so a name can follow a letter.
const FORBIDDEN = [/LLM_[A-Z0-9_]+/g];
const SCANNED_EXTENSIONS = new Set(['.js', '.hbc', '.html', '.json', '.css', '.map']);
// Every bundle the export must contain; a missing one means the check would pass vacuously.
const EXPECTED_BUNDLES = [
  { label: 'web', directory: 'client/_expo/static/js/web', extension: '.js' },
  { label: 'android', directory: '_expo/static/js/android', extension: '.hbc' },
];

const root = process.argv[2] ?? 'dist';
const serverOutput = join(root, 'server');

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (path === serverOutput) continue;
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SCANNED_EXTENSIONS.has(extname(name))) yield path;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(root)) fail(`${root} does not exist; run "npx expo export" first.`);

for (const bundle of EXPECTED_BUNDLES) {
  const directory = join(root, bundle.directory);
  const found =
    existsSync(directory) && readdirSync(directory).some((name) => name.endsWith(bundle.extension));
  if (!found) fail(`No ${bundle.label} bundle in ${directory}; export it before the check.`);
}

let scanned = 0;
const leaks = new Set();
for (const file of walk(root)) {
  scanned += 1;
  const content = readFileSync(file, 'latin1');
  for (const pattern of FORBIDDEN) {
    for (const match of content.matchAll(pattern))
      leaks.add(`${relative(root, file)}: ${match[0]}`);
  }
}

if (leaks.size > 0) {
  fail(`Server-only names found in client bundles:\n${[...leaks].join('\n')}`);
}
console.log(`OK: ${scanned} client bundle files checked, no server-only names.`);
