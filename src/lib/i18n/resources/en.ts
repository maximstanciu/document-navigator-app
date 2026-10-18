import type { TranslationTree } from '../translation-tree';

export const en = {
  common: {
    loading: 'Loading',
    errorTitle: 'Something went wrong',
    retry: 'Try again',
    cancel: 'Cancel',
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
    add: 'Add',
    addDocument: 'Add a document',
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
  capture: {
    title: 'Add a document',
    source: {
      scan: 'Scan',
      gallery: 'Photo from gallery',
      file: 'File',
    },
    sourceHint: {
      scan: 'The camera finds the page edges and straightens each page',
      gallery: 'One or more photos, as pages of one document',
      file: 'A PDF or an image from your files',
    },
    scannerUnavailable:
      "The scanner isn't available on this device. Add a photo from the gallery or a file instead.",
    tooManyPages_one: 'A document can have at most {{count}} page. Scan it again with fewer pages.',
    tooManyPages_other:
      'A document can have at most {{count}} pages. Scan it again with fewer pages.',
    reviewTitle: 'Check the pages',
    noPages: 'No pages yet',
    pageLabel: 'Page {{number}}',
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
