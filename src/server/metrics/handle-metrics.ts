import { errorResponse } from '../http/api-failure';
import type { ServerDeps } from '../server-deps';
import { StoreUnavailableError } from '../store/counter-store';
import { readBetaReport } from './beta-report';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 31;

/**
 * `GET /api/v1/metrics?days=14`: the beta's server-side metrics by UTC day (SPEC §8.7), aggregates
 * only. For the team, not the app: it needs `Authorization: Bearer <METRICS_TOKEN>`. Without the
 * variable, or with a wrong token, the route answers 404 as if it didn't exist.
 */
export async function handleMetrics(request: Request, deps: ServerDeps): Promise<Response> {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!deps.metricsToken || !token || !sameSecret(token, deps.metricsToken)) {
    return new Response(null, { status: 404 });
  }

  const days = Number(new URL(request.url).searchParams.get('days') ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return errorResponse('invalid_request', `days must be a whole number from 1 to ${MAX_DAYS}.`);
  }

  try {
    const now = deps.now();
    return Response.json({
      generatedAt: new Date(now).toISOString(),
      days: await readBetaReport(deps.store, now, days),
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return errorResponse('unavailable', 'Metrics are unavailable.');
    }
    throw error;
  }
}

/** Compares in time that doesn't depend on where the strings differ. */
function sameSecret(given: string, expected: string) {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < given.length; i++) {
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}
