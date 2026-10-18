// Source dictionary. Keys are typed (src/lib/i18n/i18next.d.ts); en.ts must have the same keys,
// with the plural forms its language needs (checked in i18n.test.ts).
export const ru = {
  common: {
    loading: 'Загрузка',
    errorTitle: 'Что-то пошло не так',
    retry: 'Повторить',
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
