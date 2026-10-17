# DocNavigator — навигатор по документам

Мобильное приложение, которое простым языком объясняет письма, счета и договоры: что это за документ, что нужно сделать, до какого числа и чем рискуешь. Пользователь сканирует документ или загружает PDF, приложение выделяет сроки, действия, риски и признаки мошенничества и напоминает о сроках.

Для кого: люди, которые получают документы на неродном языке (эмигранты, экспаты, студенты), и все, кому тяжело разбираться в бюрократии.

**Статус:** MVP в разработке. Этап 0 плана (решения и спайки) пройден на Android; iOS-сборка ещё впереди.

## Документы проекта

| Документ                                                   | Что внутри                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [docs/SPEC.md](docs/SPEC.md)                               | Требования (ID вида CAP-2, ANL-8), модель данных, контракт API, схема анализа |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Этапы, задачи, критерии приёмки, риски                                        |
| [docs/spikes/](docs/spikes/)                               | Отчёты спайков: EAS Hosting (0.2), сканер (0.4), календарь и `Intl` (0.7)     |
| [AGENTS.md](AGENTS.md)                                     | Архитектурные соглашения и правила для разработчиков и агентов                |

## Как устроено

- **iOS и Android** на Expo SDK 58 (React Native 0.88, New Architecture, Expo Router, TypeScript). Web — только превью для разработки: без сканера, уведомлений и календаря.
- **Данные только на устройстве.** Документы, страницы, сроки, действия и настройки хранятся в SQLite и файловой системе телефона. Аккаунтов нет.
- **Анализ** делает свой бэкенд: Expo API routes (`/api/v1/analyze`, `/api/v1/limits`) на EAS Hosting, LLM-провайдер за интерфейсом `LlmProvider`. Сервер не хранит ни документы, ни результаты; логирует только метаданные.
- **Напоминания** — локальные уведомления и кнопка «В календарь».
- **Сканер** — системный: ML Kit на Android, VisionKit на iOS (`react-native-document-scanner-plugin`).

```
src/
  app/          маршруты Expo Router (тонкие) и API routes (+api.ts)
  features/     доменные модули: capture, documents, analysis, deadlines, reminders, onboarding, settings
  components/   общий UI (ui/ — примитивы)
  lib/          инфраструктура клиента: env, api-клиент, query-клиент; db/, files/, i18n/ появятся на этапе 1
  shared/       чистый TS для клиента и сервера: zod-схема анализа, лимиты (этап 1)
  server/       код API routes: обработчики, провайдеры LLM, лимиты (этап 3)
  constants/ hooks/ providers/ test/
docs/           спецификация, план, отчёты спайков
.claude/        скиллы и настройки Claude Code
```

Подробная целевая структура и правила зависимостей — в [AGENTS.md](AGENTS.md) и в плане. Образец фичи на локальных данных — `src/features/documents`: чтение через репозитории, запросы с общими ключами, тесты на SQLite в памяти.

## Разработка

### Что нужно

- Node.js 22.13+ (как в CI).
- Для Android-сборок: Android SDK (`~/Android/Sdk`), JDK 17, эмулятор с Google Play или телефон с отладкой по USB.
- Для iOS: сборки только через EAS, нужен платный Apple Developer Program и iPhone.
- Аккаунт Expo — для EAS (сборки iOS, деплой API routes, обновления по воздуху).

### Запуск

Приложение использует нативные модули, которых нет в Expo Go, поэтому нужен development build.

```bash
npm install
cp .env.example .env.local     # при необходимости задать EXPO_PUBLIC_API_URL
ANDROID_HOME=~/Android/Sdk npx expo run:android --device <эмулятор или serial телефона>
npx expo start --dev-client    # Metro; приложение подключится к нему
```

Пересобирать нативную часть нужно только после установки нативного пакета или изменения плагинов в `app.json` (`npx expo prebuild --platform android --clean`, затем снова `expo run:android`). Изменения JS подхватываются без пересборки.

Быстрая проверка вёрстки без устройства — web-превью: `npm run web`.

Папки `android/` и `ios/` генерируются (Continuous Native Generation) и не коммитятся: нативные настройки — только через `app.json` и config plugins.

### Скрипты

| Скрипт              | Что делает                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| `npm start`         | Metro dev server                                                       |
| `npm run android`   | `expo run:android` — локальная сборка и установка на Android           |
| `npm run web`       | Metro + web-превью                                                     |
| `npm run verify`    | typecheck, lint, проверка Prettier, тесты — обязательно перед «готово» |
| `npm run typecheck` | `tsc --noEmit`                                                         |
| `npm run lint`      | ESLint (`eslint-config-expo`, правила React Compiler)                  |
| `npm run format`    | Prettier                                                               |
| `npm test`          | Jest (`jest-expo`, React Native Testing Library v14)                   |
| `npm run doctor`    | `expo-doctor`                                                          |

### CI

GitHub Actions (`.github/workflows/ci.yml`) на каждый push в `master` и на pull request: `npm ci` → `npm run verify`, параллельно `expo-doctor`.

### EAS

Проект `@maximst/docnavigator`. Сборки, деплой API routes и обновления по воздуху стоят денег или публикуют результат, поэтому запускаются только осознанно: см. скилл `release`. `runtimeVersion` считается по политике `fingerprint`: обновление по воздуху доходит только до сборок с тем же нативным кодом.

## Правила, которые легко нарушить

- **Конфиденциальность.** Содержимое документов и анализа (названия, отправители, суммы, цитаты) не попадает в логи, отчёты о падениях и текст уведомлений.
- **Тестовые документы** — только синтетические или обезличенные. Реальные документы с персональными данными в репозиторий не коммитим.
- **Секреты** (ключи LLM) — только в переменных окружения сервера EAS Hosting, никогда в `EXPO_PUBLIC_*`.
- **Зависимости** — из одобренного списка SPEC §10; остальное после согласования.

## Claude Code

`CLAUDE.md` подключает соглашения из `AGENTS.md` и перечисляет скиллы проекта в `.claude/skills/`: `verify`, `new-screen`, `new-component`, `new-feature`, `api-integration`, `write-tests`, `add-dependency`, `run-app`, `troubleshoot`, `performance-audit`, `accessibility-audit`, `release`. Claude выбирает их сам; можно вызвать и явно, например `/new-screen deadlines`. Дополнительно включён официальный плагин [`expo`](https://github.com/expo/skills) со скиллами Expo.
