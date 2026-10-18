import type { NewAction } from '@/lib/db/actions-repository';
import type { NewDeadline } from '@/lib/db/deadlines-repository';
import type { AnalysisResult } from '@/shared/analysis/schema';

/**
 * The deadlines and actions of an analysis as records to store (SPEC §6.1): each gets its own id,
 * and an action's `deadlineId` points to the record made from the deadline it named. A deadline
 * takes its quote and computation along (ANL-6): they must outlive a re-analysis that keeps it.
 */
export function analysisRecords(
  documentId: string,
  analysis: AnalysisResult,
  newId: () => string
): { deadlines: NewDeadline[]; actions: NewAction[] } {
  const recordIds = new Map<string, string>();
  const deadlines = analysis.deadlines.map((deadline): NewDeadline => {
    const id = newId();
    // Ids are unique after post-processing; if not, actions link to the first (SPEC §7.4).
    if (!recordIds.has(deadline.id)) recordIds.set(deadline.id, id);
    return {
      id,
      documentId,
      kind: deadline.kind,
      description: deadline.description,
      dueDate: deadline.date,
      dueTime: deadline.time,
      dateSource: deadline.dateSource,
      sourceQuote: deadline.sourceQuote,
      sourcePage: deadline.page,
      computation: deadline.computation,
      confidence: deadline.confidence,
    };
  });
  const actions = analysis.actions.map((action): NewAction => ({
    id: newId(),
    documentId,
    description: action.description,
    priority: action.priority,
    deadlineId: (action.deadlineId && recordIds.get(action.deadlineId)) || null,
  }));
  return { deadlines, actions };
}
