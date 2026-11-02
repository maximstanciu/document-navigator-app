// Runs the test set through an LlmProvider and scores the answers by SPEC §7.6 (plan tasks 0.3,
// 3.7). Each case takes the server's path: PDF check, the provider with one retry on an answer
// outside the schema, post-processing (`finalizeAnalysis`). The provider comes from the server's
// variables (`createLlmProvider`: LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY,
// LLM_REASONING_EFFORT, PDF_RENDER_URL); without them it's MockLlmProvider, which checks the
// runner, not a model. Usage and options: scripts/eval/README.md, «Прогон».
//
//   node --import ./scripts/eval/register-ts.mjs scripts/eval/run-eval.ts [--only invoices,photos-02]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { createLlmProvider } from '@/server/analysis/create-llm-provider';
import { finalizeAnalysis } from '@/server/analysis/finalize-analysis';
import { inspectPdf } from '@/server/analysis/inspect-pdf';
import { LlmProviderError, type LlmFile, type LlmProvider } from '@/server/analysis/llm-provider';
import { IMAGE_MIME_TYPE, PDF_MIME_TYPE } from '@/shared/analysis/contract';
import { isExplanationLocale, type ExplanationLocale } from '@/shared/explanation-locales';
import { MAX_DOCUMENT_BYTES } from '@/shared/limits';

import { readEvalSet, type EvalCase } from './labels';
import { formatReport, summarize, type ScoredCase } from './report';
import { scoreCase, type CaseRun } from './score';

const EVAL_DIR = import.meta.dirname;
const PYTHON = join(EVAL_DIR, '.venv/bin/python');
const MAX_UNAVAILABLE_IN_A_ROW = 3;

type RunMeta = { provider: string; locale: string; startedAt: string; set: string };

const { values: options } = parseArgs({
  options: {
    set: { type: 'string', default: join(EVAL_DIR, 'out') },
    only: { type: 'string' },
    locale: { type: 'string', default: 'ru' },
    run: { type: 'string' },
    'report-only': { type: 'boolean', default: false },
  },
});

async function main() {
  const provider = createLlmProvider(process.env, { fetch: patientFetch });
  const runDir = resolve(options.run ?? join(EVAL_DIR, 'runs', runName(provider.id)));
  const meta = readMeta(runDir) ?? {
    provider: provider.id,
    locale: options.locale,
    startedAt: new Date().toISOString(),
    set: resolve(options.set),
  };
  const { locale } = meta;
  if (!isExplanationLocale(locale)) throw new Error(`Unknown --locale ${locale}.`);
  if (meta.provider !== provider.id && !options['report-only']) {
    throw new Error(`${runDir} is a run of ${meta.provider}, not ${provider.id}.`);
  }
  mkdirSync(join(runDir, 'cases'), { recursive: true });
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(meta, null, 2) + '\n');

  const { cases: all, skipped } = readEvalSet(meta.set);
  const only = options.only?.split(',').filter(Boolean);
  const cases = only
    ? all.filter((entry) =>
        only.some((name) => entry.id === name || entry.id.startsWith(`${name}-`))
      )
    : all;
  if (cases.length === 0) throw new Error(`No cases in ${meta.set}: run synthetic/all_kits.py.`);
  console.log(
    `${cases.length} cases, ${provider.id}, run folder ${relative(process.cwd(), runDir)}`
  );

  if (!options['report-only']) {
    // A server that went away (a redeploy, a dropped tunnel) fails every case left in seconds. An
    // `unavailable` case is saved only once the model answers after it; after a few in a row the
    // run stops unsaved, so `--run` resumes there.
    const save = (file: string, run: CaseRun) =>
      writeFileSync(file, JSON.stringify(run, null, 2) + '\n');
    const unavailable: { file: string; run: CaseRun }[] = [];
    for (const [index, evalCase] of cases.entries()) {
      const file = join(runDir, 'cases', `${evalCase.id}.json`);
      if (existsSync(file)) continue;
      const position = `[${index + 1}/${cases.length}] ${evalCase.id} ${evalCase.name}`;
      process.stdout.write(`${position} ... `);
      const run = await runCase(provider, evalCase, locale, join(runDir, 'pages', evalCase.id));
      const ms = run.ms === null ? '' : ` in ${(run.ms / 1000).toFixed(0)} s`;
      console.log(`${run.outcome.kind === 'analysis' ? 'done' : run.outcome.code}${ms}`);
      if (run.outcome.kind === 'failed' && run.outcome.code === 'unavailable') {
        unavailable.push({ file, run });
        if (unavailable.length === MAX_UNAVAILABLE_IN_A_ROW) break;
        continue;
      }
      for (const pending of unavailable.splice(0)) save(pending.file, pending.run);
      save(file, run);
    }
    if (unavailable.length > 0) {
      console.log(
        `${unavailable.length} cases not saved: the model was unavailable. ` +
          `Resume with --run ${relative(process.cwd(), runDir)}.`
      );
    }
  }

  const scored: ScoredCase[] = cases.flatMap((evalCase) => {
    const file = join(runDir, 'cases', `${evalCase.id}.json`);
    if (!existsSync(file)) return [];
    const run = JSON.parse(readFileSync(file, 'utf8')) as CaseRun;
    return [{ evalCase, run, score: scoreCase(evalCase.expect, run) }];
  });
  const summary = summarize(scored);
  const reportMeta = { ...meta, skipped, pending: cases.length - scored.length };
  writeFileSync(join(runDir, 'report.md'), formatReport(reportMeta, summary, scored));
  writeFileSync(
    join(runDir, 'report.json'),
    JSON.stringify(
      {
        ...reportMeta,
        summary,
        cases: scored.map(({ evalCase, score }) => ({ id: evalCase.id, score })),
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Report: ${relative(process.cwd(), join(runDir, 'report.md'))}`);
}

/** Sends one case the way the server handles a job (handle-put-analysis.ts, analysis-worker.ts). */
async function runCase(
  provider: LlmProvider,
  evalCase: EvalCase,
  locale: ExplanationLocale,
  pagesDir: string
): Promise<CaseRun> {
  const base = {
    id: evalCase.id,
    provider: provider.id,
    locale,
    startedAt: new Date().toISOString(),
    ms: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: 0,
    retried: false,
  };
  const failed = (code: string, message: string, pageCount = 0): CaseRun => ({
    ...base,
    pageCount,
    outcome: { kind: 'failed', code, message },
  });

  let files: LlmFile[];
  let pageCount: number;
  if (evalCase.files.length === 1 && extname(evalCase.files[0]).toLowerCase() === '.pdf') {
    const bytes = new Uint8Array(readFileSync(evalCase.files[0]));
    const inspection = await inspectPdf(bytes);
    if (inspection.kind !== 'ok') return failed('invalid_pdf', `The PDF is ${inspection.kind}.`);
    files = [{ mimeType: PDF_MIME_TYPE, bytes }];
    pageCount = inspection.pageCount;
  } else {
    files = normalizedPages(evalCase.files, pagesDir).map((page) => ({
      mimeType: IMAGE_MIME_TYPE,
      bytes: new Uint8Array(readFileSync(page)),
    }));
    pageCount = files.length;
  }
  if (files.reduce((total, file) => total + file.bytes.length, 0) > MAX_DOCUMENT_BYTES) {
    return failed('too_large', 'The upload is over the size limit.', pageCount);
  }

  const context = { today: evalCase.today, pageCount };
  let retried = false;
  const startedAt = performance.now();
  try {
    const output = await provider.analyze({
      files,
      locale,
      today: evalCase.today,
      timezone: evalCase.timezone,
      checkShape: (result) => {
        const checked = finalizeAnalysis(result, context);
        if (!checked.ok) retried = true;
        return checked.ok ? null : checked.error;
      },
    });
    const finalized = finalizeAnalysis(output.result, context);
    const done = {
      ...base,
      ms: Math.round(performance.now() - startedAt),
      inputTokens: output.usage.inputTokens,
      outputTokens: output.usage.outputTokens,
      costUsd: output.costUsd,
      retried,
      pageCount,
    };
    return finalized.ok
      ? { ...done, outcome: { kind: 'analysis', analysis: finalized.analysis, raw: output.result } }
      : {
          ...done,
          outcome: {
            kind: 'failed',
            code: 'analysis_failed',
            message: finalized.error,
            raw: output.result,
          },
        };
  } catch (error) {
    const ms = Math.round(performance.now() - startedAt);
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...failed(error instanceof LlmProviderError ? error.code : 'internal', message, pageCount),
      ms,
    };
  }
}

/** The app's JPEG of each image (normalize_pages.py), made once per run folder. */
function normalizedPages(images: string[], pagesDir: string): string[] {
  const pages = images.map((_, index) => join(pagesDir, `page-${index + 1}.jpg`));
  if (!pages.every((page) => existsSync(page))) {
    execFileSync(PYTHON, [join(EVAL_DIR, 'normalize_pages.py'), pagesDir, ...images], {
      stdio: 'inherit',
    });
  }
  return pages;
}

/**
 * `fetch` over node:http without the 5-minute header timeout of Node's own: a model on a CPU sends
 * its headers only once the whole answer is ready (deploy/server.js lifts it with undici).
 */
async function patientFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  const client = url.protocol === 'https:' ? https : http;
  const body = init?.body;
  if (
    body !== undefined &&
    body !== null &&
    typeof body !== 'string' &&
    !(body instanceof Uint8Array)
  ) {
    throw new Error('patientFetch sends only string and byte bodies.');
  }
  return new Promise((resolvePromise, reject) => {
    const request = client.request(
      url,
      {
        method: init?.method ?? 'GET',
        headers: init?.headers as http.OutgoingHttpHeaders | undefined,
        signal: init?.signal ?? undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            for (const item of [value ?? []].flat()) headers.append(name, item);
          }
          resolvePromise(
            new Response(Buffer.concat(chunks), { status: response.statusCode ?? 502, headers })
          );
        });
      }
    );
    request.on('error', reject);
    request.end(body ?? undefined);
  });
}

function readMeta(runDir: string): RunMeta | null {
  const file = join(runDir, 'run.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as RunMeta) : null;
}

function runName(providerId: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(':', '');
  return `${stamp}-${providerId.replace(/[^\w.-]+/g, '_')}`;
}

await main();
