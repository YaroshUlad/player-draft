# HTTP Infrastructure

Фабрика неблокирующих HTTP transports для статистики, субтитров и других extensions.

## Entry points

- `src/http-transport-factory.ts` — выбор fetch или XHR.
- `src/fetch-transport.ts` — fetch с credentials и timeout через AbortController.
- `src/xhr-transport.ts` — только асинхронный XHR (`open(..., true)`).
- `src/types.ts` — request/response и `HttpTransport`.

## Правила

- Если `fetch` доступен, используется он.
- Если `fetch` отсутствует, используется асинхронный XHR.
- После сетевой ошибки fetch повторная отправка через XHR не выполняется, чтобы не дублировать статистику.
- Только HTTP 2xx считается успешной доставкой на уровне API stats transport.

## Проверки

- `tests/unit/http-transport.test.ts`
- Browser E2E `HTTP factory uses real fetch and asynchronous XHR`.
