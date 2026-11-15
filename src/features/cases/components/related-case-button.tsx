import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { caseQueries, useMoveToCase } from '../queries';

type RelatedCaseButtonProps = {
  /** The document whose screen this is, and the case it is filed in (`null` — none). */
  documentId: string;
  caseId: string | null;
  /** A document related to it (LINK-2), with its title as the screen shows it. */
  related: { id: string; title: string; caseId: string | null };
  /** A move was started (`false`) or has failed (`true`): the row says so under its buttons. */
  onFailedChange: (failed: boolean) => void;
};

/**
 * The button that puts two related documents in one case (LINK-4). The related document's case
 * takes this document, from another case too; if only this document has a case, the related one
 * goes there; if neither has, «New case» opens with both. Nothing for documents already in one
 * case. A case deleted meanwhile takes no document (CASE-2): the move fails.
 */
export function RelatedCaseButton({
  documentId,
  caseId,
  related,
  onFailedChange,
}: RelatedCaseButtonProps) {
  const { t } = useTranslation();
  const cases = useQuery(caseQueries.list());
  const move = useMoveToCase();

  if (caseId !== null && caseId === related.caseId) return null;

  if (caseId === null && related.caseId === null) {
    return (
      <Button
        label={t('cases.newCase')}
        aria-label={t('cases.related.newCaseLabel', { title: related.title })}
        variant="plain"
        onPress={() =>
          router.push({
            pathname: '/cases/new',
            params: { documentId, withDocumentId: related.id },
          })
        }
      />
    );
  }

  const moveHere = related.caseId !== null;
  const targetId = related.caseId ?? caseId;
  // Without its name (the cases are still being read, or the case has just gone) there is no button.
  const target = cases.data?.find((item) => item.id === targetId);
  if (!target) return null;

  const label = t(moveHere ? 'cases.related.moveHere' : 'cases.related.addRelated', {
    name: target.name,
  });

  return (
    <Button
      label={label}
      // «Move to …» is about this document; «Add to …» names the document it adds.
      aria-label={
        moveHere
          ? label
          : t('cases.related.addRelatedLabel', { title: related.title, name: target.name })
      }
      variant="plain"
      disabled={move.isPending}
      onPress={() => {
        onFailedChange(false);
        move.mutate(
          { documentIds: [moveHere ? documentId : related.id], caseId: target.id },
          { onError: () => onFailedChange(true) }
        );
      }}
    />
  );
}
