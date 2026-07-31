# Тесты и критерии актуальной сборки

## Команды

```bash
npm install
npm test
npm run build
```

Для PCOS toolchain:

```bash
node scripts/build-unix-stage7-8.mjs
node scripts/build-unix-installer.mjs
node scripts/build-unix-stage7-8.mjs --check
```

## Что покрывается

Набор `test/` включает генерацию и игровые системы, сохранения, оборудование, экономику, NPC, сеть, PCVM/ISA, protected mode, assembler/linker, BIOS, VFS, kernel/init, пользователей, shell, libc, self-hosted bootstrap, scanner и клавиатурные коды.

## Результат аудита 31 июля 2026

Полный `npm test` запущен, но не завершился за 5 минут. До ограничения времени прошло более 190 сценариев; были зафиксированы падения:

1. `balance-config.test.js` — диапазон `economy.marketTargetBase`;
2. `unix-libc.test.js` — status `crt0/main`;
3. `unix-make-env.test.js` — выполнение рецепта, рекурсивная зависимость, полный Makefile;
4. `unix-make-env.test.js` — нет цели `scanner.bin` в Makefile.

Отдельные тесты keycode не доказывают работоспособность реального scanner UI. Для закрытия BUG-001 нужен browser-level тест, который отправляет события в тот же DOM-элемент и фокус, что используются игрой.

## Условие релиза

Актуальная версия не должна называться полностью стабильной, пока `npm test` не завершается с кодом 0 и ручной smoke-test не подтверждает: загрузку мира, посадку/взлёт, PCOS boot, shell, сборку hello, запуск scanner, все его команды и возврат по `Esc`.

## Дополнительная проверка этой ревизии

Целевой набор `cpu + terminal-keycodes + unix-scanner` завершён успешно: **56/56**. Он подтверждает сборку scanner из C, два экрана и изоляцию shell от raw input, но не отменяет ручной BUG-001.

Prebuild-цепочка также выполнилась успешно:

- `scanner.bin` пересобран, размер около 12.4 КБ;
- собраны shell, 13 утилит и scanner;
- installer PCFD пересобран, 126 файлов.

Финальный `vite build` в среде аудита не запускался из-за отсутствующего локального `vite`; установка зависимости завершилась ошибкой registry `404` для `vite@^8.1.5`. Это ограничение среды, а не подтверждённый дефект исходного кода.
