/** @jest-environment node */
import { API_HEADERS } from '@/shared/api-headers';
import { limitsResponseSchema } from '@/shared/limits-contract';

import { createAnalysisJob } from '../analysis/jobs/analysis-job';
import { hashDeviceId } from '../privacy/pseudonyms';
import { StoreUnavailableError } from '../store/counter-store';
import { CLIENT_HEADERS } from '../testing/analysis-request';
import { testServerDeps } from '../testing/server-deps';
import { handleLimits } from './handle-limits';

const URL_ = 'https://docnavigator.test/api/v1/limits';

function limitsRequest(headers: Record<string, string> = {}) {
  return new Request(URL_, { headers: { ...CLIENT_HEADERS, ...headers } });
}

describe('handleLimits', () => {
  it('returns what is left of the daily limit, less the unfinished jobs (SPEC §7.2)', async () => {
    const deps = testServerDeps();
    const device = await hashDeviceId(CLIENT_HEADERS[API_HEADERS.deviceId], deps.deviceHashKey);
    const client = { requestId: 'r', device, ip: 'ip', platform: 'ios' } as const;
    for (let i = 0; i < 3; i++) {
      const { session } = await deps.usage.begin(client);
      await deps.usage.delivered(session);
    }
    const { session } = await deps.usage.begin(client);
    deps.jobs.add(
      createAnalysisJob({
        device,
        jobId: crypto.randomUUID(),
        job: 'j',
        usage: session,
        kind: 'images',
        pageCount: 1,
        locale: 'ru',
        uiLocale: 'ru',
        pushToken: null,
        queuedAt: deps.now(),
        input: { files: [], locale: 'ru', today: '2026-10-18', timezone: 'Europe/Berlin' },
      })
    );

    const response = await handleLimits(limitsRequest(), deps);

    expect(response.status).toBe(200);
    expect(limitsResponseSchema.parse(await response.json())).toEqual({
      dailyLimit: 10,
      remaining: 6,
      resetsAt: '2026-10-19T00:00:00Z',
    });
  });

  it('checks the client headers like analysis does', async () => {
    const deps = { ...testServerDeps(), minAppVersion: [2, 0, 0] as const };

    const old = await handleLimits(limitsRequest(), deps);
    const noDevice = await handleLimits(
      limitsRequest({ [API_HEADERS.appVersion]: '2.0.0', [API_HEADERS.deviceId]: 'x' }),
      deps
    );

    expect(old.status).toBe(426);
    expect(noDevice.status).toBe(400);
    expect(await noDevice.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('answers 503 when the store is down', async () => {
    const deps = testServerDeps({
      store: {
        run: async () => {
          throw new StoreUnavailableError('down');
        },
      },
    });

    const response = await handleLimits(limitsRequest(), deps);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'unavailable' } });
  });
});
