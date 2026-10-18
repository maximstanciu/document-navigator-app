import { z } from 'zod';

import {
  ANALYSIS_SCHEMA_VERSION,
  analysisResultSchema,
  llmAnalysisShapeSchema,
  type AnalysisResult,
} from '@/shared/analysis/schema';

import { postProcessAnalysis, type PostProcessContext } from './post-process-analysis';

export type FinalizedAnalysis =
  | { ok: true; analysis: AnalysisResult }
  /**
   * The output has the wrong shape: a missing field, a wrong type or an unknown enum value. `error`
   * names the paths and what was expected, for a retry prompt (task 3.2). It isn't for logs: a
   * message can quote a value from the output.
   */
  | { ok: false; error: string };

/**
 * Turns the model's output into the analysis the API returns (SPEC §7.4): checks its shape,
 * repairs bounds, dates and links with `postProcessAnalysis()`, adds `schemaVersion`.
 */
export function finalizeAnalysis(output: unknown, context: PostProcessContext): FinalizedAnalysis {
  const shape = llmAnalysisShapeSchema.safeParse(output);
  if (!shape.success) return { ok: false, error: z.prettifyError(shape.error) };

  // Post-processing leaves nothing for the strict schema to reject; if it does, that's a bug here,
  // and the client gets 502 rather than an analysis it would reject itself.
  const result = analysisResultSchema.safeParse({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    ...postProcessAnalysis(shape.data, context),
  });
  return result.success
    ? { ok: true, analysis: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}
