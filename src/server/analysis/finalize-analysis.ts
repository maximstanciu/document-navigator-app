import {
  ANALYSIS_SCHEMA_VERSION,
  llmAnalysisSchema,
  type AnalysisResult,
} from '@/shared/analysis/schema';

/**
 * Turns the model's output into the analysis the API returns, or `null` if it doesn't fit the
 * schema (the handler answers 502). Post-processing — date ranges, `deadlineId` links, trimming to
 * `ANALYSIS_BOUNDS` (SPEC §7.4) — goes here in task 3.3, before the schema check.
 */
export function finalizeAnalysis(output: unknown): AnalysisResult | null {
  const parsed = llmAnalysisSchema.safeParse(output);
  return parsed.success ? { schemaVersion: ANALYSIS_SCHEMA_VERSION, ...parsed.data } : null;
}
