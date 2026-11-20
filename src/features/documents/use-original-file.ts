import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { openOriginalFile, shareOriginalFile, type OriginalFile } from './original-file';

/**
 * «Open» and «Share» for a file of the original (DET-7). `failed` stays until the next try; nothing
 * about the file goes into the error, which no one logs.
 */
export function useOriginalFile() {
  const { t } = useTranslation();
  const open = useMutation({ mutationFn: (file: OriginalFile) => openOriginalFile(file) });
  const share = useMutation({
    mutationFn: (file: OriginalFile) => shareOriginalFile(file, t('documents.original.share')),
  });

  return {
    open: (file: OriginalFile) => {
      share.reset();
      open.mutate(file);
    },
    share: (file: OriginalFile) => {
      open.reset();
      share.mutate(file);
    },
    failed: open.isError || share.isError,
  };
}
