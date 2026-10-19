# Свой сервер: бэкенд в Docker Compose

Альтернатива EAS Hosting для API routes (`/api/v1/*`): тот же код из `src/app/api` и `src/server`, собранный `expo export --platform web --api-only` и запущенный на Node. Подходит для домашнего сервера (HP MicroServer и подобные, amd64 или arm64).

| Сервис       | Образ                                | Что делает                                                                                                               |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `api`        | собирается из `deploy/Dockerfile`    | API routes на Node (`server.js` + адаптер `expo-server`). Наружу не открыт.                                              |
| `redis`      | `redis:8.10-alpine`                  | Счётчики лимитов и метрик беты (SPEC §8.3, §8.7), том `redis-data`. Документов и результатов анализа в нём нет.          |
| `redis-http` | `hiett/serverless-redis-http:0.0.10` | REST API в формате Upstash поверх этого Redis: сервер работает с ним тем же `UpstashCounterStore`, что и на EAS Hosting. |
| `caddy`      | `caddy:2.11-alpine`                  | HTTPS с сертификатом Let's Encrypt, `X-Real-IP` из адреса соединения (на нём держится лимит по IP). Журнала доступа нет. |

## Что нужно

- Docker Engine с Compose v2 (`docker compose version`), около 2 ГБ свободной памяти на время сборки.
- Доменное имя, A/AAAA-запись которого указывает на внешний адрес сервера, и порты 80 и 443 с роутера на сервер. Без HTTPS приложение работать с сервером не будет: release-сборки iOS и Android не ходят по открытому HTTP.

## Первый запуск

```bash
git clone <репозиторий> docnavigator && cd docnavigator/deploy
cp .env.example .env
```

Заполните в `deploy/.env` три обязательные переменные: `API_DOMAIN`, `DEVICE_ID_HASH_KEY`, `COUNTER_STORE_TOKEN` (секреты — `openssl rand -hex 32`). `DEVICE_ID_HASH_KEY` после запуска не меняйте: новый ключ обнуляет дневные лимиты и разрывает метрики беты.

```bash
docker compose up -d --build
docker compose ps
```

Проверка снаружи (сертификат Caddy получает за несколько секунд после первого запроса):

```bash
curl https://api.example.com/healthz
curl https://api.example.com/api/v1/limits -H 'X-App-Version: 1.0.0' -H 'X-Platform: android' -H 'X-Device-Id: 6f1c2a9e-3b7d-4c8e-9f0a-1b2c3d4e5f60'
```

Приложение направляется на сервер переменной `EXPO_PUBLIC_API_URL=https://api.example.com` (в `.env.local` для dev-сервера, в EAS environment variables для сборок).

## Обновление и обслуживание

```bash
git pull && docker compose up -d --build   # пересобрать и заменить api; анализы в работе успевают закончиться (до 95 с)
docker compose logs -f api                 # события analyze.start / analyze.end, одна строка JSON
curl -H "Authorization: Bearer $METRICS_TOKEN" https://api.example.com/api/v1/metrics   # отчёт беты, если задан METRICS_TOKEN
```

Логи каждого контейнера ротируются: 5 файлов по 10 МБ. В них только метаданные (SPEC §7.1).

## Чем отличается от EAS Hosting

- Нет предела памяти изолята в 250 МБ и лимита CPU: ограничение одно — память сервера.
- `requestId` в логах — UUID, который сервер создаёт сам, а не `Cf-Ray`. Логи — в `docker compose logs`, а не на странице Logs деплоя.
- Счётчики — в локальном Redis, а не в Upstash. Резервная копия нужна только если важны метрики беты: том `docnavigator_redis-data`.
- Сервер работает на `MockLlmProvider`, пока нет настоящего провайдера (задача 3.2, решение D-6). Ключ провайдера потом добавляется в `deploy/.env`: контейнер `api` получает из него все переменные.

## Если на сервере уже есть обратный прокси

Уберите сервис `caddy` и откройте порт `api` (`ports: ['127.0.0.1:3000:3000']`). `TRUST_PROXY: 'true'` оставляйте только если прокси перезаписывает `X-Real-IP` адресом клиента, иначе клиент сам выбирает свой адрес и обходит лимит по IP. Без `TRUST_PROXY` сервер берёт адрес из TCP-соединения.

## Проверка на своей машине

`API_DOMAIN=:80`, `HTTP_PORT=8088`: Caddy отдаёт API по HTTP на `http://localhost:8088`.
