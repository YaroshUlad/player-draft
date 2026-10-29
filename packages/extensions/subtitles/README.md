# Subtitles Extension

Headless subtitles без создания DOM или custom renderer.

## Entry points

- `src/subtitles-extension.ts` — загрузка tracks, selection и cue events.
- `src/vtt-parser.ts` — разбор WebVTT.

## Поведение

- Загружает VTT через общую fetch/XHR фабрику.
- Сопоставляет cue с текущей позицией.
- Отправляет `player-subtitle-cue` для отрисовки host.
- Отправляет `player-subtitle-error` при ошибке загрузки.
- Предоставляет current/available tracks в `getStateInfo().subtitles`.
- Обновляет `playback-properties-update`.

Host отвечает за отображение субтитров и выбор визуального стиля.

## Проверки

- `tests/contract/subtitles-preview.test.ts`

Legacy DASH-sep/XML/VTT conversion и статистика всех subtitle preferences еще не реализованы.
