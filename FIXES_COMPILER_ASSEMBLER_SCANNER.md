# Исправления C compiler / assembler / scanner

## Что исправлено

- C codegen больше не генерирует отсутствующие мнемоники `LOAD_M_C`, `LOAD_M_D`, `STORE_C`, `STORE_D`, `CMP_B_C`, `CMP_C_D`.
- Загрузка/сохранение и сравнение регистров C/D понижаются через существующие инструкции A/B и MOV, поэтому фиксированная таблица ISA из 134 opcode не меняется.
- Host assembler принимает секционные директивы `.TEXT`, `.DATA`, `.RODATA`, `.BSS` как маркеры секций.
- В syscall libc добавлен экспорт `_sys_scan_list`; он использует существующий protected scanner syscall `0x55`.
- `examples/c/scanner.c` использует доступный низкоуровневый `_sys_input_key()` вместо отсутствующей при линковке convenience-функции `input_key()`.
- Пересобраны `system/unix/build/scanner.asm` и `scanner.bin`.

## Проверки

- `node scripts/patch-codegen-v2.mjs && node scripts/build-unix-stage7-8.mjs` — успешно.
- `node scripts/build-unix-stage7-8.mjs --check` — binaries current.
- `node --test test/cpu.test.js` — 53/53 успешно.
- `node --test test/unix-bootstrap.test.js` — 8/8 успешно, включая assembler2/linker2 self-host bootstrap.
