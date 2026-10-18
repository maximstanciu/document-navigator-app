import type { TranslationTree } from '../translation-tree';

export const en = {
  common: {
    loading: 'Loading',
    errorTitle: 'Something went wrong',
    retry: 'Try again',
    cancel: 'Cancel',
  },
  fileSize: {
    kb: '{{value}} KB',
    mb: '{{value}} MB',
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
    tooManyPhotos_one: 'A document can have at most {{count}} page. Choose fewer photos.',
    tooManyPhotos_other: 'A document can have at most {{count}} pages. Choose fewer photos.',
    unsupportedPhoto: "This photo format isn't supported. Choose JPEG, PNG or HEIC photos.",
    unsupportedFile: "This file isn't supported. Choose a PDF or a JPEG, PNG or HEIC image.",
    fileTooLarge:
      "The file is larger than {{limit}} MB, so the document can't be analyzed. Compress the PDF or scan the pages you need.",
    pagesTooLarge:
      "Together the pages are larger than {{limit}} MB, so the document can't be analyzed. Scan or choose fewer pages.",
    unreadableImage: "Couldn't open the image. Choose another photo or file.",
    preparingPages: 'Preparing the pages…',
    preparingPagesProgress: 'Preparing the pages: {{done}} of {{total}}',
    pickerFailed: "Couldn't get the files. Try again.",
    reviewTitle: 'Check the pages',
    noPages: 'No pages yet',
    pageLabel: 'Page {{number}}',
    removePage: 'Remove page {{number}}',
    scanMore: 'Scan more',
    addMorePhotos: 'Add more photos',
    analyze: 'Analyze the document',
    saveFailed: "Couldn't save the document. Try again.",
  },
  analysis: {
    draft: "This document hasn't been analyzed yet.",
    start: 'Analyze the document',
    progress: 'Reading the document…',
    keepOpen:
      'Keep the app open until the analysis is done: if you leave it or the screen turns off, the analysis stops.',
    rateLimitedUntil: 'The analysis limit is reached. You can try again after {{time}}.',
    error: {
      offline: "No internet connection. The document is saved: analyze it once you're online.",
      network:
        'The connection to the server was lost. Check the internet and keep the app open until the analysis is done.',
      timeout: "The server didn't answer in time. Try again.",
      interrupted:
        'The analysis stopped before it finished, for example because the app was closed. Try again.',
      files_missing:
        "This document's pages are no longer on the device, so it can't be analyzed. Add the document again.",
      invalid_request: "The server couldn't accept the document. Add it again.",
      too_large_one:
        'The document is too large to analyze: it can have at most {{count}} page and {{limit}} MB.',
      too_large_other:
        'The document is too large to analyze: it can have at most {{count}} pages and {{limit}} MB.',
      encrypted_pdf:
        'The file is password-protected. Open it, save a copy without the password and add that copy.',
      invalid_pdf:
        "The PDF is damaged and can't be read. Save it again or scan the paper document.",
      upgrade_required: 'This version of the app is too old to analyze documents. Update the app.',
      rate_limited: 'The analysis limit is reached. Try again later.',
      analysis_failed: "The analysis didn't return a usable result. Try again.",
      unavailable: 'The analysis service is unavailable right now. Try again later.',
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
