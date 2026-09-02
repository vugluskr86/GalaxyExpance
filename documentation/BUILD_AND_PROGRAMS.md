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

## Removable-media utilities

`mount.bin`, `umount.bin` and `lsblk.bin` are built with the ordinary native
PCOS Assembly/libc pipeline from `system/unix/bin/`. They are installed into
`/bin`, included in the PCFD installer image, and operate on the PCOS
removable-device table (`/dev/drive0`, `/dev/fd0`, `/dev/tape0`). The mounting
rules and the default scanner disk are described in
[architecture/COMPUTERS.md](architecture/COMPUTERS.md).

In the computer editor, select an item in **Removable media** and press
**Insert selected medium**. The scanner disk is in cargo for new games and is
migrated once into cargo for older player saves when absent. Insert it into
`drive_floppy`, then mount and launch it as a normal native PCOS utility:

```text
mount /dev/fd0 /mnt/scanner
scanner
```

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
