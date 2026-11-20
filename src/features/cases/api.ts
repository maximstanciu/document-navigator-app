import { randomUUID } from 'expo-crypto';

import { getRepositories } from '@/lib/db/repositories';
import type { CaseRecord } from '@/lib/db/types';

import { MAX_CASE_NAME_LENGTH, type CaseSummary } from './types';

/**
 * Data access for cases (SPEC §4.9), no React: through the repositories in `src/lib/db`. Query hooks
 * in `./queries.ts` wrap these functions.
 */

function toSummary(record: CaseRecord): CaseSummary {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt,
  };
}

/** A blank name is refused, a long one cut to `MAX_CASE_NAME_LENGTH` (CASE-1). */
function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_CASE_NAME_LENGTH).trim();
  if (!trimmed) throw new Error('A case needs a name');
  return trimmed;
}

/**
 * Cases newest first (CASE-3), archived ones too: screens that offer cases leave those out with
 * `activeCases()`, screens that name a document's case need them all (CASE-6).
 */
export async function listCases(): Promise<CaseSummary[]> {
  const cases = await getRepositories().cases.list();
  return cases.map(toSummary);
}

/** `null` when the case doesn't exist or was deleted. */
export async function getCase(id: string): Promise<CaseSummary | null> {
  const found = await getRepositories().cases.get(id);
  return found ? toSummary(found) : null;
}

/** «New case» (CASE-1), with the documents to file in it at once (CASE-2). Returns its id. */
export async function createCase(
  name: string,
  documentIds: readonly string[] = []
): Promise<string> {
  const id = randomUUID();
  await getRepositories().cases.create({ id, name: cleanName(name) }, documentIds);
  return id;
}

/** «Rename» on the case screen (CASE-5). */
export async function renameCase(id: string, name: string): Promise<void> {
  const renamed = await getRepositories().cases.rename(id, cleanName(name));
  if (!renamed) throw new Error('The case is gone');
}

/**
 * «Archive» and «Restore from archive» (CASE-6). The documents stay in the case, their deadlines and
 * reminders keep working.
 */
export async function setCaseArchived(id: string, archived: boolean): Promise<void> {
  const changed = await getRepositories().cases.setArchived(id, archived);
  if (!changed) throw new Error('The case is gone');
}

/** «Delete case» (CASE-5): the documents stay, out of any case. */
export async function deleteCase(id: string): Promise<void> {
  await getRepositories().cases.remove(id);
}

/**
 * Files documents in a case, or takes them out of any with `null` (CASE-2, CASE-4). A document in
 * another case moves: a document is in one case at most.
 */
export async function moveToCase(
  documentIds: readonly string[],
  caseId: string | null
): Promise<void> {
  const moved = await getRepositories().documents.moveToCase(documentIds, caseId);
  if (!moved) throw new Error('The case is gone');
}

/** The cases that aren't archived: the ones that take documents (CASE-2, CASE-3, CASE-6). */
export function activeCases(cases: readonly CaseSummary[]): CaseSummary[] {
  return cases.filter((item) => item.archivedAt === null);
}

/** Archived cases, the most recently archived first (CASE-6). */
export function archivedCases(cases: readonly CaseSummary[]): CaseSummary[] {
  return cases
    .filter((item) => item.archivedAt !== null)
    .sort((a, b) => ((a.archivedAt ?? '') < (b.archivedAt ?? '') ? 1 : -1));
}
