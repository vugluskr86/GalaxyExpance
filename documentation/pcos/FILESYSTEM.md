> **Статус документа:** перенесён и сверён со структурой проекта 31 июля 2026 года. Плановые пункты не считаются реализованными без подтверждения исходниками и тестами.

# PCFS v2

`PCFS` — блочный сериализуемый образ корневой файловой системы PCOS.

## Superblock

Блок имеет размер 512 байт. Первый блок содержит:

| Offset | Width | Field |
| ---: | ---: | --- |
| 0 | 4 | ASCII magic `PCFS` |
| 4 | 1 | version, сейчас `2` |
| 5 | 4 | количество блоков, little-endian |
| 9 | 4 | FNV-1a checksum байтов от offset 13 до конца образа |
| 13 | 4 | количество блоков inode table (`inodeBlocks`) |

Размер файла обязан совпадать с объявленным количеством блоков. Загрузчик
сначала проверяет magic, version и размеры, затем checksum.

## Inode table

После superblock расположена фиксированная inode-область. В PCFS v2 её размер
записан в `inodeBlocks`; допустимы значения от 1 до 64 блоков, то есть до 512
inode:

```text
inodeBlocks = superblock.u32le(13)
```

Reader сохраняет совместимость с PCFS v1. Для старого образа размер таблицы
вычисляется по прежней формуле:

```text
max(1, min(8, floor((blockCount - 1) / 4))) blocks
```

Один inode занимает 64 байта: `id`, `type`, `uid`, `gid`, `mode`, `size`,
`nlink`, `mtime_sec`, `mtime_nsec`, `dataBlock`, `dataBlocks`,
`parentInode`, затем четыре зарезервированных `u32`. Все поля little-endian.
Нулевой `id` означает свободный slot.

Фиксированный размер таблицы предотвращает наложение новых inode slots на
уже выделенные data blocks.

## Directory and data

Каталог хранится как последовательность записей:

```text
u32 nameBytes
u8  name[nameBytes]
u32 inodeId
```

Данные inode занимают непрерывный диапазон блоков. Аллокатор first-fit не
использует superblock, inode-область и блоки, принадлежащие другим inode.

Root имеет `parentInode = 0`. `..` следует по `parentInode`, но попытка выйти
выше root возвращает `EACCES`. Каждый traversed каталог требует execute/search
permission.

## Проверка

```powershell
node --test test/vfs.test.js
```

Старый плоский `ComputerMemory` разрешено импортировать только через
`importFlatFiles` как migration/install path; это не пользовательский syscall.
# Users and installed permissions

The root image is described by `system/unix/install-manifest.json`. Its
security-sensitive defaults are `/etc/shadow` `0600 root:root`, `/root`
`0700 root:root`, and `/home/guest` `0750 guest:users`. Path lookup requires
execute/search permission on every directory component, including normalized
`..` paths. Setuid and setgid file mode bits are rejected until executable
credential transitions are implemented completely.

## Installed scanner

The manifest installs `build/scanner.bin` as `/usr/bin/scanner.bin` and its
Assembly source under `/usr/src/pcos/system/unix/bin/scanner.asm`. It is a
standalone PCVM program: it enters terminal graphics mode, renders a spectrum
and uses the bounded `SCANNER_OPEN` syscall (`0x55`) to request the interactive
system-scanning driver. The call is unavailable outside an active system, so a
saved drive cannot contain fabricated scan results.
