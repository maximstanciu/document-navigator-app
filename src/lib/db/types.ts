import type { AnalyzeErrorCode } from '@/shared/analysis/contract';
import type { AnalysisResult, DeadlineKind, DocumentType, Level } from '@/shared/analysis/schema';
import type { ExplanationLocale } from '@/shared/explanation-locales';

// Records stored on the device (SPEC §6.1). Timestamps are ISO 8601 strings, calendar dates YYYY-MM-DD.
// The analysis, its enums and the server error codes come from the shared schema in src/shared.

export type DocumentStatus = 'draft' | 'analyzing' | 'ready' | 'failed';
export type DocumentSource = 'scan' | 'gallery' | 'file';
export type DocumentMimeType = 'application/pdf' | 'image/jpeg';

/** Errors the client records without a server response (SPEC §7.2). */
export type ClientErrorCode = 'interrupted' | 'network' | 'timeout' | 'offline' | 'files_missing';

export type DocumentRecord = {
  id: string;
  title: string;
  documentType: DocumentType | null;
  senderName: string | null;
  documentDate: string | null;
  status: DocumentStatus;
  errorCode: AnalyzeErrorCode | ClientErrorCode | null;
  source: DocumentSource;
  mimeType: DocumentMimeType;
  pageCount: number | null;
  fileSize: number;
  analysis: AnalysisResult | null;
  analysisLocale: string | null;
  analyzedAt: string | null;
  searchText: string;
  attentionDismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type PageRecord = {
  id: string;
  documentId: string;
  index: number;
  relativePath: string;
  width: number | null;
  height: number | null;
};

export type DeadlineStatus = 'open' | 'done' | 'dismissed';

export type DeadlineRecord = {
  id: string;
  documentId: string;
  kind: DeadlineKind;
  description: string;
  dueDate: string;
  dueTime: string | null;
  dateSource: 'explicit' | 'computed' | 'user';
  originalDate: string | null;
  confidence: Level;
  status: DeadlineStatus;
  /** `null` — defaults from settings, `[]` — reminders off. */
  reminderOffsetsDays: number[] | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ActionRecord = {
  id: string;
  documentId: string;
  deadlineId: string | null;
  description: string;
  priority: Level;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ScheduledNotificationRecord = {
  notificationId: string;
  deadlineId: string;
  fireAt: string;
};

export type InterfaceLocale = 'system' | 'ru' | 'en';

export type Settings = {
  locale: InterfaceLocale;
  /** `null` — same as the interface language (D-5). */
  explanationLocale: ExplanationLocale | null;
  /** Default reminder offsets in days before the deadline (REM-2, SET-2). */
  reminderOffsetsDays: number[];
  /** Local time for reminders, HH:mm (REM-2, SET-2). */
  reminderTime: string;
  /** Show the gist and amount in notification text (SET-5, REM-12). */
  notificationDetails: boolean;
  onboardingCompleted: boolean;
  /** Analysis consent with the version of the consent text the user accepted (ONB-2). */
  consent: { version: string; acceptedAt: string } | null;
};

export const DEFAULT_SETTINGS: Settings = {
  locale: 'system',
  explanationLocale: null,
  reminderOffsetsDays: [7, 1, 0],
  reminderTime: '09:00',
  notificationDetails: false,
  onboardingCompleted: false,
  consent: null,
};
