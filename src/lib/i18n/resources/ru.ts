// Source dictionary. Keys are typed (src/lib/i18n/i18next.d.ts); en.ts must have the same keys,
// with the plural forms its language needs (checked in i18n.test.ts).
export const ru = {
  common: {
    loading: 'Загрузка',
    errorTitle: 'Что-то пошло не так',
    retry: 'Повторить',
    cancel: 'Отмена',
  },
  fileSize: {
    kb: '{{value}} КБ',
    mb: '{{value}} МБ',
  },
  app: {
    databaseError: 'Не удалось открыть данные приложения',
  },
  tabs: {
    documents: 'Документы',
    settings: 'Настройки',
  },
  notFound: {
    title: 'Не найдено',
    message: 'Такой страницы нет.',
    goToDocuments: 'К документам',
  },
  documents: {
    title: 'Документы',
    add: 'Добавить',
    addDocument: 'Добавить документ',
    loadingList: 'Загружаем документы',
    loadingOne: 'Загружаем документ',
    emptyTitle: 'Документов пока нет',
    emptyMessage: 'Здесь появятся документы, которые вы отсканируете или добавите.',
    untitled: 'Документ без названия',
    notFoundTitle: 'Документ не найден',
    notFoundMessage: 'Возможно, его удалили.',
    pages_one: '{{count}} страница',
    pages_few: '{{count}} страницы',
    pages_many: '{{count}} страниц',
    pages_other: '{{count}} страницы',
    status: {
      draft: 'Не разобран',
      analyzing: 'Разбираем…',
      ready: 'Разобран',
      failed: 'Не удалось разобрать',
    },
    field: {
      status: 'Статус',
      from: 'Отправитель',
      documentDate: 'Дата документа',
      added: 'Добавлен',
      type: 'Тип',
      pages: 'Страницы',
    },
    kind: {
      pdf: 'PDF',
      image: 'Фото или скан',
    },
  },
  capture: {
    title: 'Добавить документ',
    source: {
      scan: 'Сканировать',
      gallery: 'Фото из галереи',
      file: 'Файл',
    },
    sourceHint: {
      scan: 'Камера сама найдёт края листа и выровняет страницы',
      gallery: 'Одно или несколько фото — страницы одного документа',
      file: 'PDF или изображение из файлов телефона',
    },
    scannerUnavailable: 'Сканер недоступен на этом устройстве. Добавьте фото из галереи или файл.',
    tooManyPages_one:
      'В документе может быть не больше {{count}} страницы. Отсканируйте его ещё раз и снимите меньше страниц.',
    tooManyPages_few:
      'В документе может быть не больше {{count}} страниц. Отсканируйте его ещё раз и снимите меньше страниц.',
    tooManyPages_many:
      'В документе может быть не больше {{count}} страниц. Отсканируйте его ещё раз и снимите меньше страниц.',
    tooManyPages_other:
      'В документе может быть не больше {{count}} страницы. Отсканируйте его ещё раз и снимите меньше страниц.',
    tooManyPhotos_one: 'В документе может быть не больше {{count}} страницы. Выберите меньше фото.',
    tooManyPhotos_few: 'В документе может быть не больше {{count}} страниц. Выберите меньше фото.',
    tooManyPhotos_many: 'В документе может быть не больше {{count}} страниц. Выберите меньше фото.',
    tooManyPhotos_other:
      'В документе может быть не больше {{count}} страницы. Выберите меньше фото.',
    unsupportedPhoto: 'Такой формат фото не подходит. Выберите фото JPEG, PNG или HEIC.',
    unsupportedFile: 'Такой файл не подходит. Выберите PDF или изображение JPEG, PNG или HEIC.',
    fileTooLarge:
      'Файл больше {{limit}} МБ, такой документ не получится разобрать. Сожмите PDF или отсканируйте нужные страницы.',
    pagesTooLarge:
      'Страницы вместе весят больше {{limit}} МБ, такой документ не получится разобрать. Снимите или выберите меньше страниц.',
    unreadableImage: 'Не удалось открыть изображение. Выберите другое фото или файл.',
    preparingPages: 'Готовим страницы…',
    preparingPagesProgress: 'Готовим страницы: {{done}} из {{total}}',
    pickerFailed: 'Не удалось получить файлы. Попробуйте ещё раз.',
    reviewTitle: 'Проверьте страницы',
    noPages: 'Страниц пока нет',
    pageLabel: 'Страница {{number}}',
    pdfLabel: 'PDF, {{name}}, {{size}}',
  },
  settings: {
    title: 'Настройки',
    language: 'Язык интерфейса',
    languageOption: {
      system: 'Как в системе',
      ru: 'Русский',
      en: 'English',
    },
    version: 'Версия',
    platform: 'Платформа',
    appearance: 'Оформление',
    appearanceValue: {
      light: 'Светлое',
      dark: 'Тёмное',
      unspecified: 'Как в системе',
    },
    api: 'Сервер анализа',
    apiNotConfigured: 'Не настроен',
    unknown: 'неизвестно',
  },
} as const;
