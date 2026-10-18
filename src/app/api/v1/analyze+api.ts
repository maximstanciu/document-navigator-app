import { createAnalyzeDeps } from '@/server/analysis/analyze-deps';
import { handleAnalyze } from '@/server/analysis/handle-analyze';

export function POST(request: Request) {
  return handleAnalyze(request, createAnalyzeDeps());
}
