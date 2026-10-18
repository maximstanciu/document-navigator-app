import type { TranslationTree } from '../translation-tree';

export const en = {
  common: {
    loading: 'Loading',
    errorTitle: 'Something went wrong',
    retry: 'Try again',
  },
  app: {
    databaseError: 'Could not open the app data',
  },
  tabs: {
    documents: 'Documents',
    settings: 'Settings',
  },
  notFound: {
    title: 'Not found',
    message: "This screen doesn't exist.",
    goToDocuments: 'Go to documents',
  },
  documents: {
    title: 'Documents',
    loadingList: 'Loading documents',
    loadingOne: 'Loading document',
    emptyTitle: 'No documents yet',
    emptyMessage: 'Documents you scan or add will show up here.',
    untitled: 'Untitled document',
    notFoundTitle: 'Document not found',
    notFoundMessage: 'It may have been deleted.',
    pages_one: '{{count}} page',
    pages_other: '{{count}} pages',
    status: {
      draft: 'Not analyzed',
      analyzing: 'Analyzing…',
      ready: 'Analyzed',
      failed: 'Analysis failed',
    },
    field: {
      status: 'Status',
      from: 'From',
      documentDate: 'Document date',
      added: 'Added',
      type: 'Type',
      pages: 'Pages',
    },
    kind: {
      pdf: 'PDF',
      image: 'Photo or scan',
    },
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    languageOption: {
      system: 'System default',
      ru: 'Русский',
      en: 'English',
    },
    version: 'Version',
    platform: 'Platform',
    appearance: 'Appearance',
    appearanceValue: {
      light: 'Light',
      dark: 'Dark',
      unspecified: 'System default',
    },
    api: 'Analysis server',
    apiNotConfigured: 'Not configured',
    unknown: 'unknown',
  },
} satisfies TranslationTree;
