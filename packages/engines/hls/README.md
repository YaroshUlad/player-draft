# HLS.js Engine

HLS playback через `hls.js@1.0.5`. Используется как fallback после Shaka.

## Entry points

- `src/hls-js-adapter.ts` — adapter и factory.
- `src/index.ts` — package exports.

## Поведение

- MSE attach и общий native video lifecycle.
- Start position и ожидание `canplay`.
- Auto/manual quality, current bitrate и levels.
- Audio/text tracks и fatal HLS errors.
- Уничтожение hls instance и video surface.

Adapter наследует protected lifecycle из `NativeHtml5Adapter`, не создавая отдельную state machine.

## Проверки

- `tests/unit/hls-js-adapter.test.ts`
- Browser HLS E2E с локальным master/variant и TS-сегментами.

UMD hls.js подключается через `@rollup/plugin-commonjs`; тестовый setup добавляет браузерные `window`, `self` и `navigator` только для Node test environment.
