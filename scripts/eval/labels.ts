import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import type { DeadlineKind, DocumentType, Level } from '@/shared/analysis/schema';

// The reference labels the synthetic kits write (scripts/eval/README.md, «Формат labels.json»).

export type ExpectedDeadline = {
  label: string;
  required: boolean;
  kind: DeadlineKind[];
  date: string;
  toleranceDays: number;
  time: string | null;
  dateSource: 'explicit' | 'computed';
  quote: string;
  page: number | null;
  linkedActionsMin?: number;
  note?: string;
};

export type ForbiddenDeadline = { date: string | null; quote: string; reason: string };

export type ExpectedRisk = {
  label: string;
  required: boolean;
  severity: Level[];
  quote: string;
  page: number | null;
};

export type ExpectedKeyFact = {
  kind: string;
  value: string;
  required: boolean;
  page: number | null;
};

export type ExpectedFraud = { max: 0 } | { min: number; page: number | null; signals: string[] };

export type AnalysisExpectation = {
  outcome: 'analysis';
  pageCount?: number;
  documentType?: DocumentType;
  documentLanguage?: string;
  documentDate?: string | null;
  sender?: { name: string; kind: string };
  quality?: { readable: boolean; issuesAnyOf?: string[]; issuesMayInclude?: string[] };
  deadlines?: ExpectedDeadline[];
  forbidden?: ForbiddenDeadline[];
  risks?: ExpectedRisk[];
  keyFacts?: ExpectedKeyFact[];
  fraudSignals?: ExpectedFraud;
  note?: string;
};

type LabelledCase = {
  files: string[];
  source: 'file' | 'gallery';
  covers: string[];
  expect: AnalysisExpectation | { outcome: 'client_error' | 'server_error' };
};

type LabelsFile = {
  kit: string;
  request: { today: string; timezone: string };
  documents: LabelledCase[];
};

/** One case that expects an analysis, with absolute paths to its pages in order. */
export type EvalCase = {
  /** `<kit>-<nn>`, nn from 01 in the order of labels.json. */
  id: string;
  /** The first file's name, for people reading the report. */
  name: string;
  files: string[];
  today: string;
  timezone: string;
  expect: AnalysisExpectation;
};

/**
 * The cases of every kit under `setDir` (`<setDir>/<kit>/labels.json`) that expect an analysis.
 * Cases the app or the server rejects before the model (`client_error`, `server_error`) are left to
 * the smoke test: they say nothing about the model.
 */
export function readEvalSet(setDir: string): { cases: EvalCase[]; skipped: number } {
  const cases: EvalCase[] = [];
  let skipped = 0;
  const kits = readdirSync(setDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const kit of kits.map((entry) => entry.name).sort()) {
    let labels: LabelsFile;
    try {
      labels = JSON.parse(readFileSync(join(setDir, kit, 'labels.json'), 'utf8')) as LabelsFile;
    } catch {
      continue; // not a kit, e.g. a folder of earlier runs
    }
    labels.documents.forEach((document, index) => {
      if (document.expect.outcome !== 'analysis') {
        skipped += 1;
        return;
      }
      cases.push({
        id: `${labels.kit}-${String(index + 1).padStart(2, '0')}`,
        name: basename(document.files[0], extname(document.files[0])),
        files: document.files.map((file) => join(setDir, kit, file)),
        today: labels.request.today,
        timezone: labels.request.timezone,
        expect: document.expect,
      });
    });
  }
  return { cases, skipped };
}
