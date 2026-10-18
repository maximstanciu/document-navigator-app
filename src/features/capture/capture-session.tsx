import { createContext, use, useState, type PropsWithChildren } from 'react';

import type { DocumentSource } from '@/lib/db/types';

import type { CapturedPage } from './types';

type CaptureState = { source: DocumentSource | null; pages: CapturedPage[] };

export type CaptureSession = CaptureState & {
  /** Starts over with the pages from one source. */
  start: (source: DocumentSource, pages: CapturedPage[]) => void;
};

const CaptureSessionContext = createContext<CaptureSession | null>(null);

/**
 * The document being added, shared by the screens of the capture modal (src/app/capture/_layout.tsx).
 * It lives only while the modal is open; nothing is stored until the review screen saves a draft.
 */
export function CaptureSessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<CaptureState>({ source: null, pages: [] });
  const session: CaptureSession = {
    ...state,
    start: (source, pages) => setState({ source, pages }),
  };
  return <CaptureSessionContext value={session}>{children}</CaptureSessionContext>;
}

export function useCaptureSession(): CaptureSession {
  const session = use(CaptureSessionContext);
  if (!session) throw new Error('useCaptureSession() is used outside CaptureSessionProvider');
  return session;
}
