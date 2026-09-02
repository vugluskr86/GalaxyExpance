> **Фактический статус на 31 июля 2026:** программа собирается из `examples/c/scanner.c` и рисует UI внутри PCVM. Ручная проверка показала, что стабильно работает только `Tab`; `Esc`, стрелки, `Enter`, `D/R/S` остаются неисправными. Утверждения старых ревизий о полном прохождении управления считать устаревшими.

# Scanner как нативная C-программа PCOS

`scanner` собирается исключительно из `examples/c/scanner.c` и выполняется процессором PCVM как обычный пользовательский процесс PCOS.

## Архитектура

Цепочка запуска:

```text
examples/c/scanner.c
  -> PCVM C compiler
  -> system/unix/build/scanner.asm
  -> assembler + linker + libc syscall wrappers
  -> system/unix/build/scanner.bin
  -> /usr/bin/scanner.bin на установочном диске PCOS
```

Программа не вызывает `SCANNER_OPEN`, syscall `0x55`, `ScannerScene` или иной специальный JS-интерфейс. Оба окна из `../design/SCAN_DESIGN.md` рисует сам бинарник:

- System Scanner;
- Planetary Survey / Probe Control.

Для вывода используются только общие системные примитивы PCOS: переключение графического режима, очистка, линии, прямоугольники, окружности и текст. Для текста добавлен общий syscall `GFX_TEXT` (`0x67`), который не содержит логики сканера.

## Где лежат исходники

Основной исходник:

```text
examples/c/scanner.c
```

Заголовки C ABI:

```text
libc/include/pcos.h
```

Обёртки системных вызовов:

```text
libc/sys/syscalls.asm
```

Результаты сборки:

```text
system/unix/build/scanner.asm
system/unix/build/scanner.bin
```

`scanner.asm` является генерируемым файлом. Править нужно `examples/c/scanner.c`, а не собранный Assembly.

## Пересборка scanner

Из корня проекта:

```bash
node scripts/patch-codegen-v2.mjs
node scripts/build-unix-stage7-8.mjs
node scripts/build-unix-installer.mjs
```

Первая команда оставлена для совместимости со старым процессом сборки. Основные исправления ABI уже находятся в `src/compiler/codegen.js`.

Проверка, что бинарники актуальны:

```bash
node scripts/build-unix-stage7-8.mjs --check
```

Тест scanner:

```bash
node --test test/unix-scanner.test.js
```

Основные CPU/libc/scanner тесты:

```bash
node --test test/cpu.test.js test/unix-libc.test.js test/unix-scanner.test.js
```

## Установка в PCOS

Скрипт установщика берёт готовый файл:

```text
system/unix/build/scanner.bin
```

и помещает его в:

```text
/usr/bin/scanner.bin
```

Shell разрешает запуск по имени:

```text
scanner
```

Исходники в `examples/` предназначены для разработки на host-машине. Исполняемый файл внутри PCOS должен храниться в `/usr/bin`, пользовательские экспериментальные бинарники удобно хранить в `/home/<user>/bin` либо `/usr/local/bin`, если каталог добавлен в PATH.

## Управление

System Scanner:

```text
Arrows   выбор цели и настройка частоты
Enter    накопление качества захвата
Tab      Planetary Survey
Esc      выход
```

Planetary Survey:

```text
D        развернуть зонд
R        отозвать зонд
S        сканировать поверхность
Tab      вернуться в System Scanner
Esc      выход
```

## Ограничение текущего C-компилятора

C ABI передаёт до четырёх аргументов через `A/B/C/D`. В scanner используются только функции без пользовательских параметров и прямые вызовы syscall-обёрток. Это позволяет избежать старого незавершённого механизма stack-аргументов. Кодогенератор исправлен так, чтобы вызовы с максимум четырьмя аргументами соответствовали ABI и не повреждали стек.
