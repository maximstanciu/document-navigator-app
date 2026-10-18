/** @jest-environment node */
import { testServerDeps } from '../testing/server-deps';
import { handleMetrics } from './handle-metrics';

const TOKEN = 'm'.repeat(40);
const URL_ = 'https://docnavigator.test/api/v1/metrics';

function metricsRequest(query = '', token: string | null = TOKEN) {
  return new Request(`${URL_}${query}`, {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });
}

describe('handleMetrics', () => {
  it('reports the last 14 days to the team token', async () => {
    const deps = testServerDeps({ metricsToken: TOKEN });
    const { session } = await deps.usage.begin({
      requestId: 'r',
      device: 'd',
      ip: 'ip',
      platform: 'ios',
    });
    await deps.usage.end(session, { code: 'ok', charged: true, costUsd: 0.5, hasDeadline: true });

    const response = await handleMetrics(metricsRequest(), deps);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.generatedAt).toBe('2026-10-18T12:00:00.000Z');
    expect(body.days).toHaveLength(14);
    expect(body.days[0]).toMatchObject({
      day: '2026-10-18',
      started: 1,
      withDeadline: 1,
      costUsd: 0.5,
    });
    // Aggregates only: no pseudonyms of devices.
    expect(JSON.stringify(body)).not.toContain('"d"');
  });

  it('takes the number of days from the query', async () => {
    const deps = testServerDeps({ metricsToken: TOKEN });
    const body = await (await handleMetrics(metricsRequest('?days=3'), deps)).json();
    expect(body.days.map((day: { day: string }) => day.day)).toEqual([
      '2026-10-18',
      '2026-10-17',
      '2026-10-16',
    ]);
  });

  it.each(['?days=0', '?days=32', '?days=two'])('rejects %s', async (query) => {
    const deps = testServerDeps({ metricsToken: TOKEN });
    expect((await handleMetrics(metricsRequest(query), deps)).status).toBe(400);
  });

  it.each([
    ['without METRICS_TOKEN on the server', null, TOKEN],
    ['without a token in the request', TOKEN, null],
    ['with a wrong token', TOKEN, 'x'.repeat(40)],
    ['with a token of another length', TOKEN, 'short'],
  ])('answers 404 %s', async (_case, configured, sent) => {
    const deps = testServerDeps({ metricsToken: configured });
    const response = await handleMetrics(metricsRequest('', sent), deps);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
});
