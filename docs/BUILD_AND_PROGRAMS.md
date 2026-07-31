# Сборка проекта и программ PCOS

## Web-проект

```bash
npm install
npm run dev
npm test
npm run build
```

Vite development server запускает проект локально; production bundle создаётся командой `npm run build`.

## Где хранить исходники программ

- C-примеры: `examples/c/*.c`.
- Assembly-примеры: `examples/*.asm` и тематические подкаталоги.
- Системные Assembly-программы PCOS: `system/unix/bin/*.asm`.
- Kernel/init/libc: `system/unix/kernel/`, `system/unix/init/`, `system/unix/lib/`.
- Сгенерированные файлы не редактируются вручную: `system/unix/build/*`, `src/game/install-media.generated.js`.

## Scanner

Источник истины: `examples/c/scanner.c`.

Цепочка:

```text
examples/c/scanner.c
  -> C compiler
system/unix/build/scanner.asm
  -> assembler/linker
system/unix/build/scanner.bin
  -> installer image
/usr/bin/scanner.bin
```

Scanner обязан рисовать UI и обрабатывать ввод внутри PCVM через syscall. Вызов специальной JS-сцены вместо нативной программы запрещён архитектурным решением.

## Пересборка системных программ

```bash
node scripts/patch-codegen-v2.mjs
node scripts/build-unix-stage7-8.mjs
node scripts/build-unix-installer.mjs
```

Проверка, что build-артефакты не устарели:

```bash
node scripts/build-unix-stage7-8.mjs --check
```

## Правила хранения

Исходники коммитятся. Сгенерированные `.asm`, `.obj`, `.bin`, installer manifest и generated JS должны обновляться одной сборкой и проверяться тестами. Не следует вручную подменять `scanner.bin`: иначе исходник C, промежуточный Assembly и образ PCOS расходятся.
