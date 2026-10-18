import { handleMetrics } from '@/server/metrics/handle-metrics';
import { createServerDeps } from '@/server/server-deps';

export function GET(request: Request) {
  return handleMetrics(request, createServerDeps());
}
