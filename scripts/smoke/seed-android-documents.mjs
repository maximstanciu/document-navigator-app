#!/usr/bin/env node
// Seeds synthetic documents into the Android development build for the device smoke test
// (docs/smoke-test.md, «Список и действия с документом»): a list of 100+ documents with deadlines
// near and far, fraud signs and high risks. Needs Node 22.6+ (node:sqlite, type stripping), adb, and
// a debuggable build (run-as).
//
//   node --experimental-strip-types scripts/smoke/seed-android-documents.mjs [count]
//   node scripts/smoke/seed-android-documents.mjs --restore scripts/smoke/out/<backup>
//
// The app is stopped first and its database is backed up to scripts/smoke/out/ (git-ignored); the
// copy is seeded on this machine and pushed back. The analyses are the synthetic fixtures of
// src/shared/analysis/fixtures.ts, which imports types only, so Node can load it. Seeded documents
// have no page files: their «Original» is unavailable and «Analyze again» isn't offered (STO-8).

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE = 'com.stanciu.docnavigator';
const DB_DIR = 'files/SQLite';
const DB_FILES = ['docnavigator.db', 'docnavigator.db-wal', 'docnavigator.db-shm'];
const ROOT = resolve(import.meta.dirname, '../..');
const ADB = join(process.env.ANDROID_HOME ?? join(homedir(), 'Android/Sdk'), 'platform-tools/adb');

// One string per command: the device shell parses it, quotes included.
const shell = (command, input) =>
  execFileSync(ADB, [input ? 'exec-in' : 'exec-out', command], {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
const runAs = (command) => `run-as ${PACKAGE} sh -c '${command}'`;

function pull(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of DB_FILES) {
    writeFileSync(join(dir, name), shell(runAs(`cat ${DB_DIR}/${name} 2>/dev/null`)));
  }
}

function push(dir, names) {
  shell(runAs(`rm -f ${DB_FILES.map((name) => `${DB_DIR}/${name}`).join(' ')}`));
  for (const name of names) {
    shell(runAs(`cat > ${DB_DIR}/${name}`), readFileSync(join(dir, name)));
  }
  // Private to the app, as SQLite creates them.
  shell(runAs(`chmod 600 ${names.map((name) => `${DB_DIR}/${name}`).join(' ')}`));
}

shell(`am force-stop ${PACKAGE}`);

if (process.argv[2] === '--restore') {
  const backup = resolve(process.argv[3] ?? '');
  push(
    backup,
    DB_FILES.filter((name) => readFileSync(join(backup, name)).length > 0)
  );
  console.log(`Restored the database from ${backup}. Open the app again.`);
  process.exit(0);
}

const count = Number(process.argv[2] ?? 120);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(ROOT, 'scripts/smoke/out', `backup-${stamp}`);
const work = join(ROOT, 'scripts/smoke/out', `seeded-${stamp}`);
pull(backup);
mkdirSync(work, { recursive: true });
for (const name of DB_FILES) copyFileSync(join(backup, name), join(work, name));

const { DatabaseSync } = await import('node:sqlite');
const { ANALYSIS_FIXTURES } = await import(
  pathToFileURL(join(ROOT, 'src/shared/analysis/fixtures.ts')).href
);

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const inDays = (days) => {
  const date = new Date(now.getTime() + days * DAY);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
// As src/lib/db/search-text.ts builds `search_text` (HOME-3).
const normalize = (value) =>
  value.toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const KINDS = ['invoice', 'officialNotice', 'contract', 'fraudulentInvoice', 'unreadable'];
// Days to the first deadline of a few documents, for «Needs attention»; the rest are far away.
const NEAR = { 0: -4, 6: -1, 12: 2, 18: 9 };

const db = new DatabaseSync(join(work, 'docnavigator.db'));
const insertDocument = db.prepare(`INSERT INTO documents (id, title, document_type, sender_name,
  document_date, status, error_code, source, mime_type, page_count, file_size, analysis,
  analysis_locale, analyzed_at, search_text, attention_dismissed_at, created_at, updated_at,
  deleted_at) VALUES (?, ?, ?, ?, ?, 'ready', NULL, 'scan', 'image/jpeg', 1, 400000, ?, 'ru', ?, ?,
  NULL, ?, ?, NULL)`);
const insertDeadline = db.prepare(`INSERT INTO deadlines (id, document_id, kind, description,
  due_date, due_time, date_source, original_date, source_quote, source_page, computation,
  confidence, status, reminder_offsets_days, created_at, updated_at, deleted_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'open', NULL, ?, ?, NULL)`);
const insertAction = db.prepare(`INSERT INTO actions (id, document_id, deadline_id, description,
  priority, done, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)`);

db.exec('BEGIN');
for (let i = 0; i < count; i++) {
  const fixture = ANALYSIS_FIXTURES[KINDS[i % KINDS.length]];
  const id = randomUUID();
  // One document every two days back: only the newest few are within the 14-day window (HOME-1).
  const created = new Date(now.getTime() - (i * 2 + 1) * DAY).toISOString();
  const title = `${fixture.title} · тест ${String(i + 1).padStart(3, '0')}`;
  const sender = fixture.sender?.name ?? null;
  const searchText = normalize(
    [title, sender, fixture.summary, ...fixture.keyFacts.map((fact) => fact.value)]
      .filter(Boolean)
      .join(' ')
  );
  insertDocument.run(
    id,
    title,
    fixture.documentType,
    sender,
    fixture.documentDate,
    JSON.stringify({ ...fixture, title }),
    created,
    searchText,
    created,
    created
  );
  const first = NEAR[i] ?? 30 + (i % 50) * 3;
  const deadlineIds = new Map();
  fixture.deadlines.forEach((deadline, n) => {
    const deadlineId = randomUUID();
    deadlineIds.set(deadline.id, deadlineId);
    insertDeadline.run(
      deadlineId,
      id,
      deadline.kind,
      deadline.description,
      inDays(first + n * 7),
      deadline.time,
      deadline.dateSource,
      deadline.sourceQuote,
      deadline.page,
      deadline.computation,
      deadline.confidence,
      created,
      created
    );
  });
  for (const action of fixture.actions) {
    insertAction.run(
      randomUUID(),
      id,
      (action.deadlineId && deadlineIds.get(action.deadlineId)) || null,
      action.description,
      action.priority,
      created,
      created
    );
  }
}
db.exec('COMMIT');
// Everything into the main file, so it alone goes back to the device.
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const { total } = db
  .prepare('SELECT COUNT(*) AS total FROM documents WHERE deleted_at IS NULL')
  .get();
db.close();

push(work, ['docnavigator.db']);
console.log(`Seeded ${count} documents, ${total} in the app now. Open the app again.`);
console.log(`To undo: node scripts/smoke/seed-android-documents.mjs --restore ${backup}`);
