import { handleLimits } from '@/server/limits/handle-limits';
import { createServerDeps } from '@/server/server-deps';

export function GET(request: Request) {
  return handleLimits(request, createServerDeps());
}
