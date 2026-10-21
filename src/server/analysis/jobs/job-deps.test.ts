/** @jest-environment node */
import { createServerDeps } from '../../server-deps';
import { AnalysisWorker } from './analysis-worker';
import { createAnalysisJobDeps, readJobConfig } from './job-deps';

describe('readJobConfig', () => {
  it('runs one job at a time and queues 20 by default', () => {
    expect(readJobConfig({})).toEqual({ concurrency: 1, queueMax: 20 });
  });

  it('reads ANALYSIS_CONCURRENCY and ANALYSIS_QUEUE_MAX', () => {
    expect(readJobConfig({ ANALYSIS_CONCURRENCY: '2', ANALYSIS_QUEUE_MAX: '5' })).toEqual({
      concurrency: 2,
      queueMax: 5,
    });
  });

  it.each([
    [{ ANALYSIS_CONCURRENCY: '0' }, 'ANALYSIS_CONCURRENCY'],
    [{ ANALYSIS_CONCURRENCY: '1.5' }, 'ANALYSIS_CONCURRENCY'],
    [{ ANALYSIS_QUEUE_MAX: 'twenty' }, 'ANALYSIS_QUEUE_MAX'],
  ])('fails on a misconfigured %o, naming the variable', (env, name) => {
    expect(() => readJobConfig(env)).toThrow(name);
  });
});

describe('createAnalysisJobDeps', () => {
  it('keeps one worker per process, over the jobs every route sees', () => {
    const deps = createAnalysisJobDeps({});

    expect(deps.worker).toBeInstanceOf(AnalysisWorker);
    expect(deps.queueMax).toBe(20);
    expect(createAnalysisJobDeps({}).worker).toBe(deps.worker);
    expect(createServerDeps({}).jobs).toBe(deps.jobs);
  });

  it('fails on a misconfigured queue before taking uploads', () => {
    expect(() => createAnalysisJobDeps({ ANALYSIS_QUEUE_MAX: '0' })).toThrow('ANALYSIS_QUEUE_MAX');
  });
});
