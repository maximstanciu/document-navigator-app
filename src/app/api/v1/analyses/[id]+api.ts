import {
  handleDeleteAnalysis,
  handleGetAnalysis,
  handlePatchAnalysis,
} from '@/server/analysis/jobs/handle-analysis-job';
import { handlePutAnalysis } from '@/server/analysis/jobs/handle-put-analysis';
import { createAnalysisJobDeps } from '@/server/analysis/jobs/job-deps';
import { createServerDeps } from '@/server/server-deps';

type Params = Record<string, string | undefined>;

export function PUT(request: Request, { id }: Params) {
  return handlePutAnalysis(request, id, createAnalysisJobDeps());
}

export function GET(request: Request, { id }: Params) {
  return handleGetAnalysis(request, id, createServerDeps());
}

export function PATCH(request: Request, { id }: Params) {
  return handlePatchAnalysis(request, id, createServerDeps());
}

export function DELETE(request: Request, { id }: Params) {
  return handleDeleteAnalysis(request, id, createServerDeps());
}
