> **Статус документа:** перенесён и сверён со структурой проекта 31 июля 2026 года. Плановые пункты не считаются реализованными без подтверждения исходниками и тестами.

# Self-hosted Unix-like операционная система PCOS

## Цель

Создать для внутриигрового компьютера небольшую Unix-like систему, в которой
всё системное и пользовательское ПО исполняется процессором PCVM и написано на
его Assembly:

```text
BIOS (real mode)
  → kernel.bin (kernel mode)
    → init.bin, PID 1 (user mode)
      → фоновые службы
      → sh.bin (user mode)
        → отдельные пользовательские программы
```

### Scanner как программа PCOS

`/usr/bin/scanner.bin` собирается из `system/unix/bin/scanner.asm` и запускается
обычной командой `scanner` в терминале установленного компьютера. Программа
сама использует графические syscall PCVM для стартового спектра, затем вызывает
`SCANNER_OPEN (0x55)`. В активной звёздной системе этот вызов подключает
интерактивную мини-игру к реальным настройкам антенны и к данным мира; вне
системы возвращается явная ошибка. Важное ограничение ABI: Assembly не получает
прямой доступ к JavaScript-объектам сцены, а только просит открыть разрешённый
драйвер системы.

Сетевой драйвер не передаёт программе сканера прямые ссылки на игровые предметы.
Она конфигурирует IP сканера и антенны у PCOS-клиента; перед анализом сеть строит
маршрут компьютер → коммутатор → устройство и фиксирует два UDP-кадра
телеметрии. DHCP/DNS настраиваются на выбранном коммутаторе в отдельном GUI,
вместе с его портами, MAC-таблицей и выданными арендами.

Обязательные отдельные бинарники:

- `kernel.bin` — ядро, процессы/потоки, память, VFS, права и syscall;
- `init.bin` — PID 1, загрузка конфигурации и управление службами;
- `sh.bin` — командная оболочка;
- `ls.bin`, `cat.bin`, `grep.bin`, `cp.bin`, `mv.bin`, `mkdir.bin`,
  `top.bin`, `make.bin`, `rm.bin`, `link.bin`, `vi.bin`, `debugger.bin`;
- при необходимости небольшие службы `getty.bin`, `login.bin`, `logger.bin`.

Каждый бинарник должен иметь отдельный Assembly-исходник. Host JavaScript
может эмулировать CPU, RAM, DRIVE и устройства, но не должен реализовывать
команды shell, init policy, файловые права или логику Unix-утилит.

## Исходное состояние проекта

Уже реализованы:

- PCVM v3 и protected feature;
- kernel/user mode, IVT, исключения и IRET;
- `SYSCALL`, проверка user pointers и отрицательные errno;
- round-robin, TIMER preemption и полный context frame;
- виртуальная память процесса, `UBASE/ULIMIT`, R/W/X, NX stack и guard;
- базовые процессы, IPC, терминал и плоские операции DRIVE;
- self-hosted `assembler.asm` и `linker.asm`;
- PCVM v2 compatibility в real mode.

Текущие ограничения, которые нельзя маскировать:

- DRIVE пока является плоским списком файлов, а не иерархической VFS;
- `open/close` зарезервированы, но файловых дескрипторов ещё нет;
- нет UID/GID, inode, каталогов, владельцев и mode bits;
- нет `fork/exec`, pipes, signals и Unix wait status;
- allocation syscall ещё не подключён к полноценному per-process heap;
- shell и kernel policy частично представлены JavaScript-классом `PixelOS`;
- self-hosted linker имеет ограничения multi-object пути.

## Требование self-hosted

Система считается self-hosted только если выполняется цепочка:

```text
*.asm
  → assembler.bin на PCVM
  → *.obj
  → linker.bin на PCVM
  → *.bin
  → kernel/init/sh/utilities исполняются PCVM
```

Host assembler разрешён как bootstrap и oracle для тестов. Финальный тест
должен пересобрать toolchain и ОС внутри PCVM и сравнить декодируемую семантику
результата с host-сборкой.

## Предлагаемая структура

```text
system/unix/
  include/
    abi.inc
    errno.inc
    syscall.inc
    fs.inc
    process.inc
    user.inc
  kernel/
    entry.asm
    syscall.asm
    process.asm
    scheduler.asm
    memory.asm
    vfs.asm
    permissions.asm
    devices.asm
    kernel.asm
  init/
    init.asm
  shell/
    sh.asm
  lib/
    crt0.asm
    libc.asm
    string.asm
    io.asm
    getopt.asm
    userdb.asm
  bin/
    ls.asm
    cat.asm
    grep.asm
    cp.asm
    mv.asm
    mkdir.asm
    top.asm
    make.asm
    rm.asm
    link.asm
    vi.asm
    debugger.asm
    login.asm
    passwd.asm
  etc/
    passwd
    group
    init.conf
    fstab
    motd
    profile
  installer/
    installer.asm
    manifest.txt
    install.conf
  tests/
    ...
examples/unix/
  ...
```

Если self-hosted assembler ещё не поддерживает `.include`, сначала добавить
его либо генерировать объединённые translation units детерминированным
self-hosted инструментом. Нельзя вручную копировать ABI-константы по файлам:
это неизбежно создаст несовместимые номера syscall и offsets структур.

## Целевая модель ядра

### Процессы и потоки

Минимальный process descriptor:

```text
pid, ppid, pgid
uid, gid, effective_uid, effective_gid
state: ready/running/sleeping/stopped/zombie/faulted
exit_status
UBASE, ULIMIT, KSP, context_frame
text/data/heap/guard/stack layout
cwd inode
open file descriptor table
signal/pending event mask
children list
accounting: ticks, start time, preemptions
```

На первом релизе допустим один user thread на процесс. Kernel task и
background processes планируются тем же round-robin. Поддержку нескольких
threads внутри процесса добавлять только после стабильных `spawn/exec/wait`.

### Память

- TEXT — `R/X`;
- DATA/heap — `R/W`;
- guard — без прав;
- stack — `R/W`, NX;
- kernel memory не отображается пользователю;
- `brk` или `alloc/free` управляет heap процесса;
- все syscall pointers проверяются вместе с длиной и направлением доступа;
- allocation принадлежит PID и освобождается при exit/fault.

### Файловая система

Минимальная inode-подобная модель:

```text
inode:
  id, type, uid, gid, mode, size, links, mtime, data/block reference

directory entry:
  parent_inode, name, inode

open file:
  inode, offset, flags, refcount

process fd:
  0 stdin, 1 stdout, 2 stderr, 3...
```

Типы: regular, directory, device. Символические ссылки можно отложить.
Обязательны абсолютные и относительные пути, `.`, `..`, `cwd`, root `/`.

Mode bits:

```text
0400/0200/0100 owner r/w/x
0040/0020/0010 group r/w/x
0004/0002/0001 other r/w/x
```

Root имеет UID 0. Проверка выполняется в kernel VFS для каждого path traversal
и каждой операции, а не только в shell.

### Пользователи

`/etc/passwd`:

```text
root:x:0:0:Superuser:/root:/bin/sh
guest:x:1000:1000:Guest:/home/guest:/bin/sh
```

`/etc/shadow`:

```text
root:<salt>$<iterated-hash>
guest:<salt>$<iterated-hash>
```

`/etc/group`:

```text
root:x:0:
users:x:1000:guest
```

Пароль нельзя хранить открытым текстом. Если ISA не имеет криптографического
примитива, для игрового окружения допустим документированный salted iterated
FNV-1a, но он не должен называться безопасным для реальных систем. Сравнение
хешей выполняется без раннего выхода.

### Init

`/etc/init.conf`:

```text
[service logger]
exec=/bin/logger
restart=always

[service shell]
exec=/bin/sh
tty=terminal0
restart=on-failure
```

PID 1:

1. монтирует root;
2. открывает `/dev/console`;
3. читает конфигурацию;
4. запускает службы;
5. запускает login/shell;
6. собирает zombie через `wait`;
7. перезапускает службы по policy;
8. при критической ошибке выводит recovery shell.

### Shell

Минимальная грамматика:

```text
line       := pipeline (";" pipeline)*
pipeline   := command ("|" command)*
command    := WORD argument* redirect*
redirect   := ">" WORD | ">>" WORD | "<" WORD
```

Этап 1 shell может начать без pipes, но parser и структуры нельзя проектировать
так, чтобы pipes потребовали полной переписи. Обязательны:

- `$PATH`, `$HOME`, `$USER`, `$?`, `$$`;
- builtins: `cd`, `pwd`, `export`, `unset`, `exit`, `help`;
- запуск `/bin/*.bin`;
- поиск executable по `PATH`;
- quoting хотя бы `"..."` и `\`;
- exit status;
- Ctrl+C/terminate event, когда появятся signals.

## План реализации

### Этап 0. Зафиксировать Unix ABI ✅

Зафиксированы нормативные таблицы syscall, errno, structs и limits.
Добавлены недостающие системные вызовы:

- process: `EXEC` (0x08), `GETPPID` (0x09), `PROCESS_INFO` (0x0A);
- descriptors: `DUP` (0x13), `DUP2` (0x14);
- VFS: `SEEK` (0x26), `STAT` (0x27), `READDIR` (0x28), `MKDIR` (0x29),
  `UNLINK` (0x2A), `RENAME` (0x2B), `CHMOD` (0x2C), `CHOWN` (0x2D),
  `GETCWD` (0x2E), `CHDIR` (0x2F);
- system: `UNAME` (0x52), `SYSINFO` (0x53);
- debug: `DEBUG_READ_REGS` (0x80) … `DEBUG_STEP` (0x85).

Единственный нормативный источник: `src/game/protected-mode.js`.
Генератор Assembly-констант: `scripts/generate-unix-abi.mjs`.
Сгенерированные include-файлы: `system/unix/include/abi.inc` и split-файлы.
Режим проверки: `node scripts/generate-unix-abi.mjs --check`.

ABI stability tests в `test/cpu.test.js` (6 тестов с префиксом "ABI stage 0:")
подтверждают уникальность номеров syscall, размеры всех structs, errno
и совпадение Assembly/host констант.

Сохраняется PCVM v2 compatibility: новые syscall доступны только через
`SYSCALL n` в PCVM v3 user mode.

### Этап 1. Иерархическая VFS и образ диска ✅

Реализован `src/game/vfs.js`: inode regular/directory/device, абсолютные и
относительные пути, cwd, контролируемый `..`, search/read/write permissions,
open-file-description, per-process fd table с зарезервированными 0/1/2,
Unix-семантика общего offset для `dup`, операции VFS и миграция старого
плоского `ComputerMemory`.

Формат `PCFS v1` использует блоки 512 байт, фиксированную inode-область,
magic/version/declared block count и FNV-1a checksum. Фиксированная область
важна: рост inode-таблицы не может перезаписать уже выделенные data blocks.
Подробности находятся в `system/unix/FILESYSTEM.md`.

Тесты `test/vfs.test.js` проверяют traversal, cwd, permissions, rename,
serialize/deserialize, повреждённые images, fd/dup и invalid user pointers.

Остаётся host-side: `VFSKernel` пока является проверяемым oracle/device
механизмом. Assembly syscall policy подключается к нему на этапах 2–3.

### Этап 2. Отдельный kernel.bin — bootstrap-каркас ✅

Добавлены отдельные Assembly-модули `system/unix/kernel/{entry,memory,devices,
process,scheduler,vfs,permissions,syscall}.asm`. Они линкуются в
`system/unix/build/kernel.bin`, включают protected mode, задают UBASE/ULIMIT,
kernel stack и IVT, резервируют PID 1 и запрашивают загрузку только
`/sbin/init.bin`. Dummy init является отдельным user-mode binary.

Сборка: `node scripts/build-unix-kernel.mjs`; проверка воспроизводимости:
`node scripts/build-unix-kernel.mjs --check`. Интеграционный тест
`test/unix-kernel.test.js` проверяет BIOS → kernel.bin → dummy init.bin,
MODE transitions, IVT, PID 1 и отсутствие прямого JS PixelOS shell.

Для IVT host linker поддерживает `ABS_ANY` relocation при загрузке адреса
TEXT-символа; строгая секционная проверка для `JMP/JZ/JNZ/CALL` сохранена.

Ограничения bootstrap-каркаса:

- syscall handler пока является контролируемым входом с `IRET`, полный
  Assembly dispatcher и process lifecycle выполняются на этапе 3;
- VFS и permission Assembly-модули пока создают kernel-owned hooks, а
  проверяемая inode-механика остаётся host device/oracle;
- `kernel.bin` сейчас собирается host `AssemblyCompiler/Linker` как bootstrap.
  Полный self-hosted multi-object rebuild системным `assembler.bin` и
  `linker.bin` остаётся обязательным критерием этапа 11;
- CPU формирует context frame аппаратно. Kernel-mode fault до передачи
  управления Assembly handler всё ещё формирует host deterministic panic;
  расширенный Assembly panic dump требует отдельного архитектурного входа.

### Этап 3. Process lifecycle ✅

Assembly-модуль `system/unix/kernel/process.asm` определяет 64-байтный PCB,
PID/PPID/PGID, состояния ready/running/sleeping/stopped/zombie/faulted,
exit status, ticks/preemptions, events TERM/KILL/CHLD и адресное пространство.
Экспортированы точки `process_spawn`, `process_exec_commit`, `process_exit`,
`process_fault`, `process_wait`, `process_kill`, `process_adopt_orphans` и
`process_account_tick`. TIMER handler обновляет accounting перед `IRET`;
`syscall.asm` содержит Assembly dispatcher для process syscall.

Временный host oracle `ProcessManager` приведён к той же семантике:

- child сохраняет PPID/PGID и остаётся zombie/faulted до `wait`;
- `wait/waitpid` возвращает status и только после этого разрешает PID reuse;
- потомки завершившегося процесса усыновляются PID 1;
- TERM/KILL работают для ready/sleeping процессов и создают CHLD;
- exec сначала декодирует executable и резервирует новый memory block, поэтому
  invalid executable/OOM не разрушает старый address space;
- exit/fault освобождают RAM и все fd через refcounted open-file descriptions;
- учитываются ticks, start time и preemptions.

Protected trap ABI расширен kernel-only инструкциями:

- `KGET_FAULT` читает номер syscall из trap;
- `KGET_ARG n` читает исходные `A–D` из сохранённого context frame;
- `KCALL_HOST` разрешает Assembly dispatcher вызвать только механизм
  устройства/VFS для уже выбранного syscall;
- `SYSRET` записывает результат `A–D` в frame и выполняет проверенный возврат.

При `kernelManagedSyscalls` CPU больше не вызывает `executeSystemCall()` и не
делает скрытый `IRET`: он только создаёт frame и переходит по IVT. Исполняемый
тест подтверждает, что `GETPID` возвращается Assembly handler и host callback
не вызывается. Отдельный Assembly integration test реально выполняет цепочку
`spawn → exit → zombie → wait → reap` над PCB в RAM. Host `ProcessManager`
сохранён как legacy PixelOS/oracle и как механизм загрузки address space, но
маршрутизация и process state policy PCOS находятся в `kernel.bin`.

Тесты находятся в `test/process-lifecycle.test.js`.

### Этап 4. libc и crt0 ✅

Self-hosted статическая библиотека находится в `system/unix/lib`:

- `crt0.asm`: `_start`, ABI `A=argc, B=argv, C=envp, D=auxv`, затем
  `main → exit`;
- `syscall.asm`: process/memory/VFS wrappers и per-process `libc_errno`;
- `string.asm`: memcpy/memcmp, bounded strlen/strcmp/strncmp/strcpy;
- `stdlib.asm`: parse_int, decimal и hexadecimal format_int;
- `io.asm`: puts, printf `%s/%d/%x`, fread/fwrite с short-write loop, fflush;
- `path.asm`: bounded path join;
- `getopt.asm`: Unix short-option iterator с `optind/optarg`.

Calling convention описан в `system/unix/lib/README.md`: аргументы функций
передаются в `B/C/D`, результат в `A`, `A–D` caller-saved, errno возвращается
в `D` и копируется в `libc_errno`.

Воспроизводимая bootstrap-сборка:

```text
node scripts/build-unix-libc.mjs
node scripts/build-unix-libc.mjs --check
```

Настоящая self-hosted проверка запускает `assembler.asm` и `linker.asm` внутри
PCVM, причём host предоставляет только CPU/RAM/DRIVE:

```text
node scripts/selfhost-unix-libc.mjs
node scripts/selfhost-unix-libc.mjs --check
```

Артефакты: `libc.obj`, `libc-selfhost.obj`, `hello-libc.bin` и
`hello-libc-selfhost.bin` в `system/unix/build`. Пример:
`examples/unix/hello-libc.asm`.

`test/unix-libc.test.js` проверяет entry ABI и stack balance, errno, OOM,
short writes, strings, числа, printf, path/getopt и исполнение результата
self-hosted toolchain.

### Этап 5. Users, passwords и permissions

Реализовать UID/GID, mode checks, passwd/group parser, login и passwd.
Добавить `/root`, `/home/guest`, владельцев и права installer-образа.

Результат: guest не читает `/etc/shadow` и не изменяет root-owned файлы.

Статус: **выполнено**.

Выполнено:

- syscall ABI `setuid/setgid/getuid/getgid/setsid` закреплён в `0x0B–0x0F`;
- PCB и host process descriptor содержат `uid/gid/euid/egid`;
- VFS применяет effective UID/GID, owner/group/other bits и search permission;
- `chmod` доступен владельцу/root, `chown` — только root;
- setuid/setgid mode bits явно запрещены;
- реализованы и исполняются Assembly parser/hash/constant-work comparison;
- добавлены шаблоны `passwd`, `group`, `shadow` и install manifest;
- `login.bin` читает passwd/shadow через libc, принимает username/password,
  проверяет hash, устанавливает GID перед UID и запускает shell из passwd;
- environment ABI `ENV_SET/ENV_GET` передаёт `USER`, `HOME`, `SHELL`
  дочернему shell;
- `passwd.bin` проверяет старый пароль, формирует новый hash и атомарно заменяет
  shadow через root-owned `shadow.new` `0600` и `rename`;
- `scripts/generate-unix-shadow.mjs` воспроизводимо создаёт игровые root/guest
  test credentials;
- исполняемые Assembly test vectors проверяют salt, 1024 rounds, equal/unequal
  constant-work comparison и разбор полей user database;
- негативные тесты покрывают `..`, hard link, rename, сохранённый cwd,
  descriptor после смены credentials/mode и setuid bits.

Игровой password hash не предназначен для хранения реальных паролей и не
считается криптографически стойким.

### Этап 6. init.bin

Реализовать parser `/etc/init.conf`, запуск служб, wait/reap и restart policy.
Kernel должен запускать только `/sbin/init`, а не shell напрямую.

Результат: boot log подтверждает `kernel → init PID 1 → login/sh`.

Статус: **выполнено**.

Выполнено:

- `system/unix/init/init.asm` собирается как отдельный protected PCVM v3 binary;
- kernel выполняет только `BOOT "/sbin/init.bin"`;
- init открывает config через libc/syscall, выполняет wait/reap, ограничение
  рестартов и recovery path;
- добавлены `init.conf`, `fstab`, `motd`, logger и отдельные build artifacts.
- Assembly token parser разбирает до восьми `[service NAME]` и обязательные
  `exec`, `restart`, `tty`, `user`, `group`;
- service executable берётся из `exec=`, а не из жёстко записанного списка;
- `user=root|guest` и `group=root|users` преобразуются в credentials процесса;
- реализованы `restart=never`, `on-failure`, `always`, секундный backoff и
  переход в recovery после пяти быстрых аварий;
- missing/malformed config, неизвестные user/group, отсутствующий executable и
  critical crash приводят к recovery shell;
- shutdown event (`wait` sentinel PID `-2`) завершает init чисто;
- orphan adoption выполняется kernel process manager при exit родителя;
- integration-тесты исполняют `init.bin` с normal boot, malformed/missing
  config, exit status 0/1, всеми restart policy, crash loop, missing binary и
  shutdown.

Конфигурация: `system/unix/etc/init.conf`, `fstab`, `motd`. Сборка этапов:

```text
node scripts/build-unix-stage5-6.mjs
node scripts/build-unix-stage5-6.mjs --check
```

Результаты: `system/unix/build/login.bin`, `passwd.bin`, `logger.bin`,
`init.bin`. Негативные permission и init-policy тесты находятся в
`test/unix-users-init.test.js`.

### Этап 7. sh.bin

Реализовать tokenizer/parser, builtins, environment, PATH, redirection и
запуск отдельных executable. Pipes можно выполнить вторым подэтапом.

Результат: скрипт smoke-test выполняет команды и проверяет `$?`.

Статус: **выполнено**.

Выполнено:

- отдельный protected `/bin/sh.bin`, использующий только libc/syscall;
- bounded Assembly syntax scanner распознаёт quotes, backslash, `;`, `#`,
  `<`, `>`, `>>` и pipeline node `|`;
- builtins `cd`, `pwd`, `export`, `unset`, `exit`, `help`;
- inherited `HOME/USER/PATH/SHELL`, status storage и `/bin` PATH lookup;
- внешний `spawn/wait`, передача командной строки через bounded `ARGS`;
- исполняемые sequence nodes `cmd1 ; cmd2`, при этом `;` внутри quotes не
  разделяет команды;
- pipeline node `|` исполняется через bounded spool и наследуемые
  stdin/stdout descriptors; цепочка не требует дополнительного CPU thread;
- `<`, `>` и `>>` открывают файл и передают stdin/stdout атомарно через
  `SPAWN_FD`; cwd и open-file descriptions наследуются дочерним процессом;
- expansion `$NAME`, `$?`, `$$`, quoting-aware argument lexer и Ctrl+C
  (`status=130`);
- динамический prompt `user@pcos:cwd$`;
- script-driven тесты проверяют builtins, PATH, environment, sequence,
  redirection, pipeline, quoting, status expansion, Ctrl+C и внешний
  executable.

### Этап 8. Базовые файловые утилиты

Отдельные бинарники `ls`, `cat`, `grep`, `cp`, `mv`, `mkdir`, `rm`, `link`, `chown`, `chgrp`, `user`, `find`.
Каждый использует libc и VFS syscall, возвращает Unix-like status.

Статус: **выполнено**.

Выполнено:

- собраны отдельные protected binaries `ls`, `cat`, `grep`, `cp`, `mv`,
  `mkdir`, `rm`, `link`, `chown`, `chgrp`, `user`, `find`;
- общая Assembly-библиотека содержит только повторяемый argv/error/streaming
  runtime; каждая команда имеет отдельные source/object/bin и entry point;
- `cat` (включая несколько и quoted файлов) и `cp` работают потоково,
  `mkdir`, `link`, `rm` проверены на VFS;
- `mv` использует rename и содержит EXDEV copy+unlink fallback;
- install manifest устанавливает каждый binary как `0755 root:root`;
- `ls -a` обходит все страницы `readdir`, `ls -l` выводит реальные
  `type/mode/uid/gid/size/name` из `stat`;
- `grep -n` выполняет bounded построчный streaming match;
- `mkdir -p`, bounded рекурсивные `find` и `rm -r` используют общий
  Assembly traversal и удаляют дерево в обратном порядке;
- общий argument/option/usage runtime возвращает `0` для успеха, `1` для
  runtime error и `2` для usage error;
- `cp` использует short-write loop и удаляет partial destination при ошибке;
- integration-тесты проверяют отдельность binaries, отсутствие privileged
  FS opcode, quoting, paging, long listing, streaming grep, recursive
  traversal и реальные изменения VFS.

### Этап 9. top.bin

Статус: **выполнено**.

- отдельный protected `/bin/top.bin` написан на Assembly и использует только
  libc/syscall ABI;
- `PROCESS_LIST` возвращает bounded бинарный snapshot PID, упорядоченный по
  `ticks DESC, pid ASC`;
- `PROCESS_INFO` заполняет полную безопасную 128-байтную структуру:
  PID/PPID, uid/gid, state, exit status, ticks, preemptions, memory, start time
  и command; регистры, kernel pointers, KSP/UBASE/ULIMIT не раскрываются;
- `SYSINFO` возвращает uptime, RAM/DRIVE total/free, число процессов и CPU
  threads;
- `top` обновляет text terminal, показывает
  `PID USER STATE TICKS MEM COMMAND`, обрабатывает `q`, пропускает исчезнувший
  между snapshot и `PROCESS_INFO` PID и ограничивает все буферы;
- install manifest устанавливает `/bin/top.bin` как `0755 root:root`;
- тесты покрывают ready/running/sleeping/zombie/faulted, ticks order,
  исчезновение PID, маленький terminal, `q` и отсутствие privileged opcode.

Сборка:

```text
node scripts/build-unix-stage9.mjs
node scripts/build-unix-stage9.mjs --check
```

`make`, `vi`, `debugger` и `env` остаются отдельными последующими
пользовательскими программами и не входят в критерии Prompt 9.

### Этап 10. Установочная дискета

Определить `PCFD` image/manifest. Включить binaries, sources, libraries,
headers и `/etc` templates. `installer.bin` форматирует root, копирует файлы,
ставит mode/owner, создаёт пользователей и выбирает `kernel.bin`.

Реализовано: `scripts/build-unix-installer.mjs` создаёт
`system/unix/build/install.pcfd`, `install.manifest.json` и `installer.bin`.
Полный образ больше обычной 144-КБ дискеты, поэтому выдаётся как установочный
носитель `PCFD-65535` (64 МБ). При загрузке `installer.bin` открывает
интерактивный выбор target DRIVE, root password и guest; новый PCFS собирается
и проверяется до публикации, затем BIOS получает boot target `kernel.bin`.
`install.conf` поддерживает unattended-конфигурацию в тестах.

### Этап 11. Self-hosted build

`make.bin` должен собрать libc, kernel, init, shell и utilities с помощью
self-hosted assembler/linker. Нужны reproducible manifest и dependency order.

### Этап 12. Hardening и release

Fuzz path parser, corrupt filesystem images, invalid pointers, permissions,
PID exhaustion, fd leaks, out-of-memory, killed service, bad init config,
bootstrap и install/boot from clean disk.

## Критерии готовности всей ОС

- BIOS остаётся real-mode firmware.
- BIOS загружает отдельный `kernel.bin`.
- Kernel работает в kernel mode, user binaries — только в user mode.
- Kernel запускает `/sbin/init`; init запускает login/sh.
- Все перечисленные команды являются отдельными PCVM v3 binaries.
- Ни одна user utility не использует прямые privileged opcode.
- VFS поддерживает каталоги, cwd, fd и Unix mode bits.
- `/etc/passwd`, `/etc/group`, `/etc/shadow` имеют корректных владельцев/права.
- Installer создаёт загрузочный диск из пустого DRIVE.
- Исходники и toolchain находятся на установленной системе.
- Система пересобирает саму себя внутри PCVM.
- Старый PCVM v2 остаётся доступен только как явно совместимый legacy binary.
- Негативные тесты не позволяют user-коду читать kernel/чужую память или
  обходить VFS permissions.

# Промты для DeepSeek

Ниже каждый промт рассчитан на отдельный последовательный этап. Перед каждым
следующим этапом агент должен получить актуальное состояние репозитория и
прочитать `COMPUTERS.md`, `../toolchain/ASSEMBLER.md`, `OS.md`, существующие тесты и
изменения предыдущего этапа.

## Правило автоматизации для всех промтов

Любой нетривиальный скрипт нужно сначала создать как отдельный
версионируемый файл в `scripts/`, а затем запустить короткой командой.

Разрешённый порядок:

```text
1. Создать или изменить scripts/generate-unix-abi.mjs через apply_patch.
2. Проверить содержимое файла.
3. Запустить: node scripts/generate-unix-abi.mjs
4. Проверить сгенерированные файлы и тесты.
```

Запрещено:

- `node -e "..."` и `node --eval`;
- `python -c "..."`, inline Python и аналогичные однострочные интерпретаторы;
- heredoc/here-string с программой, сразу передаваемой интерпретатору;
- генерировать файлы длинной командой PowerShell;
- помещать многострочный JavaScript в аргумент shell-команды;
- повторно запускать зависшую inline-команду в изменённом quoting.

Скрипты должны:

- находиться в `scripts/`;
- иметь понятное имя и один назначенный результат;
- использовать ESM (`.mjs`) для Node.js, если проект не требует иного;
- завершаться с ненулевым кодом при ошибке;
- печатать короткий итог, а не содержимое всех сгенерированных файлов;
- быть идемпотентными;
- проверять целевые пути и создавать только ожидаемые каталоги;
- не перезаписывать вручную изменяемые файлы без явного generated-header;
- по возможности иметь тест или режим `--check`, который выявляет устаревшие
  generated-файлы без их изменения.

Если скрипт завис, агент должен остановить процесс, проверить сам файл скрипта
и его входные данные, а не конструировать новую inline-команду.

## Prompt 0 — аудит и фиксация Unix ABI

```text
Ты работаешь в репозитории Pixel Cosmos. Прочитай полностью COMPUTERS.md,
ASSEMBLER.md, OS.md, src/game/protected-mode.js, src/game/cpu.js,
src/game/os.js, system/assembler.asm, system/linker.asm и test/cpu.test.js.

Задача: выполнить этап 0 из OS.md — зафиксировать Unix ABI до реализации
ядра. Не начинай писать shell или утилиты.

Требования:
1. Составь таблицу существующих syscall и найди свободные диапазоны.
2. Добавь нормативные номера для exec, wait, getppid, process_info,
   open/close/read/write/seek/stat/readdir/mkdir/unlink/rename/chmod/chown,
   getcwd/chdir, dup, uname/sysinfo и минимального debug API.
3. Зафиксируй errno: EPERM, ENOENT, ESRCH, EINTR, EIO, ENXIO, E2BIG, ENOEXEC,
   EBADF, ECHILD, EAGAIN, ENOMEM, EACCES, EFAULT, EBUSY, EEXIST, EXDEV,
   ENOTDIR, EISDIR, EINVAL, ENFILE, EMFILE, ENOSPC, ESPIPE, EROFS, EPIPE,
   ENAMETOOLONG, ENOSYS.
4. Определи бинарные layouts stat, dirent, process_info, timespec и syscall
   argument blocks. Укажи offsets, widths, alignment и little-endian.
5. Создай system/unix/include/*.inc или другой единый источник констант.
   Не допускай ручного дублирования таблиц между JS и Assembly.
   Генератор обязательно сохрани как scripts/generate-unix-abi.mjs.
   Запускай только командой `node scripts/generate-unix-abi.mjs`.
   Добавь режим `node scripts/generate-unix-abi.mjs --check`, который ничего
   не записывает и завершает работу с ошибкой, если include-файлы устарели.
   Не используй node -e, inline JavaScript, heredoc или PowerShell-генерацию.
   Скрипт должен создавать system/unix/include только внутри workspace,
   генерировать единый abi.inc и при необходимости split include-файлы.
6. Сохрани PCVM v2 compatibility. Новые syscall доступны PCVM v3 user mode.
7. Добавь ABI stability tests и обнови OS.md фактическим статусом.

Нельзя:
- реализовывать Unix policy в JavaScript;
- менять существующие opcode или номера уже опубликованных syscall;
- принимать user pointer без проверки полного диапазона и направления R/W.

Готово, когда тесты подтверждают уникальность номеров, размеры всех structs,
errno и совпадение Assembly/host констант. В конце перечисли изменённые файлы,
команды тестов и оставшиеся блокеры этапа 1.
```

## Prompt 1 — VFS, inode и формат диска

```text
Выполни этап 1 OS.md. Сначала прочитай нормативный ABI этапа 0. Реализуй
иерархическую VFS и сериализуемый root filesystem для внутриигрового DRIVE.

Обязательная модель:
- inode: id, type, uid, gid, mode, size, links, mtime, data reference;
- directory entries parent/name/inode;
- types regular, directory, device;
- абсолютные/относительные пути, '.', '..', cwd и root '/';
- NAME_MAX и PATH_MAX из ABI;
- open file description с offset/flags/refcount;
- per-process fd table, зарезервированные 0/1/2;
- операции open, close, read, write, seek, stat, readdir, mkdir, unlink,
  rename, chmod, chown, getcwd, chdir.

Сделай path resolver отдельным тестируемым модулем kernel/VFS. Каждая
компонента пути должна проверять execute/search permission каталога. Запрети
удаление непустого каталога и обход root через '..'. Все user buffers должны
проверяться до изменения FS, чтобы ошибка не оставляла частичную запись.

Определи версионированный disk image format с magic, version, bounds checks и
checksum либо строгой проверкой размеров. Добавь импорт старого плоского
ComputerMemory только как migration/install path, не как user syscall.

Тесты:
- создание дерева и traversal;
- relative cwd;
- duplicate names, ENOENT, ENOTDIR, EISDIR;
- rename между каталогами;
- fd offsets и dup semantics;
- повреждённые images;
- serialize → deserialize без потери metadata;
- invalid user pointer не меняет filesystem.

Не начинай init/shell. Обнови OS.md и документацию формата.
```

## Prompt 2 — отдельный self-hosted kernel.bin

```text
Выполни этап 2 OS.md: создай отдельное ядро system/unix/kernel/kernel.asm,
собираемое в kernel.bin self-hosted assembler/linker.

Архитектура:
- BIOS PCVM v2 остаётся в real mode и загружает kernel.bin;
- kernel entry включает protected mode, создаёт IVT и kernel stacks;
- syscall dispatcher, process table, scheduler hooks, memory ownership,
  VFS и permission checks находятся в Assembly kernel;
- host JS предоставляет только CPU/RAM/DRIVE/terminal device primitives;
- kernel загружает первый user binary /sbin/init.

Раздели исходники entry/syscall/process/scheduler/memory/vfs/permissions/devices
и собери их linker-ом. Если include/multi-object возможности toolchain
недостаточны, сначала расширь toolchain с тестами, не склеивай файлы вручную.

Kernel panic должен выводить cause, fault address, PID и registers, не читать
непроверенные user strings. Fault user-процесса переводит только его в
faulted/zombie. Fault kernel mode вызывает deterministic panic.

Добавь integration test:
BIOS → kernel.bin → dummy init.bin; проверь MODE transitions, IVT, PID 1,
изоляцию памяти и отсутствие прямого запуска JS PixelOS shell.

Сохрани временный host oracle только за feature flag тестов. Зафиксируй в
OS.md, какая kernel policy ещё остаётся host-side и почему.
```

## Prompt 3 — процессы, exec/wait и events

```text
Выполни этап 3 OS.md в Assembly kernel.

Реализуй:
- PID/PPID/PGID;
- states ready/running/sleeping/stopped/zombie/faulted;
- spawn + exec с заменой address space;
- exit status и wait/waitpid;
- orphan adoption PID 1;
- zombie до wait;
- accounting ticks/start/preemptions;
- events/signals TERM, KILL, CHLD;
- безопасное освобождение RAM/fd/cwd при exit/fault.

Не требуется copy-on-write fork. Если fork слишком дорог, документируй
spawn+exec как основной primitive, но shell pipeline API должен оставаться
расширяемым.

Проверь executable magic/version/features до выделения процесса. DATA не
должен пересекать guard/stack. Exec должен быть атомарным: при ошибке старый
образ процесса продолжает работать.

Тесты:
- parent spawn child wait status;
- zombie и reap;
- killed sleeping process;
- invalid executable;
- OOM rollback;
- faulted child даёт status;
- PID reuse только после reap;
- два бесконечных процесса не блокируют короткий;
- fd refcounts закрываются ровно один раз.
```

## Prompt 4 — libc, crt0 и syscall wrappers

```text
Выполни этап 4 OS.md. Создай self-hosted статическую библиотеку для user
programs: crt0, syscall wrappers, string/memory, integer formatting, path,
getopt и buffered fd I/O.

Требования:
- _start получает argc/argv/envp по зафиксированному ABI;
- вызывает main и syscall exit;
- wrappers сохраняют регистры согласно calling convention;
- errno хранится per-process либо возвращается явно единообразно;
- функции open/read/write/close/stat/readdir/mkdir/unlink/rename/chdir/getcwd;
- malloc/free поверх brk или alloc/free;
- strlen/strcmp/strncmp/strcpy с обязательной capacity;
- parse_int и format_int без host JS;
- puts/printf минимум %s %d %x без float.

Собери libc.obj и минимальную hello.bin только self-hosted toolchain.
Добавь ABI/calling-convention тесты, stack balance, OOM и short read/write.
Перепиши один существующий пример на libc, не переписывай пока все утилиты.
```

## Prompt 5 — UID/GID, passwd и Unix permissions

```text
Выполни этап 5 OS.md.

Kernel:
- uid/gid/euid/egid в process descriptor;
- owner/group/other rwx checks для inode;
- search x permission на каждом каталоге path;
- только root выполняет chown/setuid;
- chmod разрешён owner/root;
- setuid bits пока запрети или реализуй полностью, не оставляй частично;
- /etc/shadow читается только UID 0.

Userland:
- parser /etc/passwd, /etc/group, /etc/shadow;
- login.bin и passwd.bin;
- salted iterated hash на Assembly;
- constant-work comparison;
- HOME/USER/SHELL после login.

Installer defaults:
/etc/passwd 0644 root:root
/etc/group 0644 root:root
/etc/shadow 0600 root:root
/root 0700
/home/guest 0750 guest:users

Тесты должны попытаться обойти права через '..', fd, rename, hard link,
сохранённый cwd и уже открытый descriptor. Явно документируй игровую, а не
криптографическую стойкость выбранного password hash.
```

## Prompt 6 — init.bin

```text
Выполни этап 6 OS.md. Создай отдельный /sbin/init.bin, PID 1, на Assembly.
Kernel запускает только init, init запускает остальные процессы.

Реализуй parser /etc/init.conf формата из OS.md:
[service name], exec=, restart=never/on-failure/always, tty=, user=, group=.
Не используй JS parser.

Init должен:
- открыть console;
- смонтировать/проверить root;
- загрузить config;
- запустить logger и login/sh;
- wait/reap всех children;
- усыновлять orphan;
- перезапускать по policy с rate limit;
- не создавать restart loop;
- запускать recovery shell при ошибке config/critical service;
- корректно сообщать boot progress.

Добавь init.conf, fstab, motd. Тесты: normal boot, missing config, malformed
section, service exit 0/1, crash loop, отсутствующий binary, shutdown event.
Проверь цепочку kernel → init PID 1 → shell, а не прямой host вызов shell.
```

## Prompt 7 — sh.bin

```text
Выполни этап 7 OS.md. Создай отдельный /bin/sh.bin на Assembly и libc.

Сначала tokenizer/parser:
- whitespace;
- single/double quotes хотя бы double quotes;
- backslash;
- ';';
- redirects < > >>;
- pipeline node даже если pipe syscall будет добавлен подэтапом;
- комментарий # вне quotes.

Runtime:
- PATH lookup;
- argc/argv;
- env HOME USER PATH SHELL ? $;
- builtins cd pwd export unset exit help;
- внешний spawn/exec/wait;
- exit status;
- stdin/stdout/stderr redirection с dup;
- prompt user@host:cwd$;
- EOF и Ctrl+C event.

Shell не должен содержать реализацию ls/cat/cp и других внешних команд.
Каждая команда — отдельный binary. Нельзя использовать прямые hardware/FS
opcode: только libc/syscall.

Добавь script-driven tests с заранее поданными terminal lines и проверкой
вывода, cwd, файлов, argv, quoting, status и permission errors.
```

## Prompt 8 — ls/cat/grep/cp/mv/mkdir/rm/link

```text
Выполни этап 8 OS.md. Каждая утилита — отдельный Assembly source/object/bin,
использующий crt0/libc и только syscall ABI.

Минимальные опции:
ls [-l] [-a] [path]
cat [file...]
grep [-n] pattern [file...]
cp source destination
mv source destination
mkdir [-p] path
rm [-r] path
link source destination

Требования:
- единый getopt/usage style;
- ошибки в stderr;
- exit 0 success, 1 runtime failure, 2 usage;
- short read/write loops;
- cp не оставляет молча успешный partial file;
- mv использует rename, при EXDEV делает copy+unlink;
- rm -r не следует циклически по специальным entries;
- ls -l показывает type/mode/uid/gid/size/name;
- grep работает потоково и не требует загрузить весь файл.

Для каждой команды добавь unit/integration tests и shell smoke test.
Обнови install manifest /bin и permissions 0755 root:root.
```

## Prompt 9 — top.bin и process information

```text
Реализуй /bin/top.bin.

Сначала зафиксируй безопасный process_info syscall/readdir-like API. User
может видеть PID, state, uid, command, ticks, memory, preemptions, но не
kernel pointers, KSP или чужие registers.

Top:
- text terminal;
- периодическое обновление;
- uptime, RAM used/free, process counts;
- таблица PID USER STATE TICKS MEM COMMAND;
- q для выхода;
- сортировка хотя бы по ticks;
- bounded buffers и обработка изменения process list между запросами.

Тестируй несколько ready/sleeping/zombie/faulted процессов, исчезновение PID,
маленький terminal и отсутствие привилегий. Отдельный top.bin, никакой логики
top в shell или JS.
```

## Prompt 10 — make.bin и self-hosted сборка

```text
Реализуй упрощённый /bin/make.bin.

Формат Makefile:
target: dependency...
    command arguments...

Минимум:
- parser строк и continuation;
- dependency graph;
- cycle detection;
- timestamp comparison;
- variables NAME=value и $(NAME);
- builtin recipes asm и link либо запуск /bin/assembler,/bin/link;
- -f file, -n dry-run, target argument;
- прекращение при ненулевом status.

Не выполняй command через host. Make вызывает sh/exec внутри PCVM.
Создай системный Makefile, который собирает libc, kernel, init, sh и все
utilities в правильном порядке. Добавь clean image build в staging tree.

Критерий: установленная система пересобирает хотя бы hello, затем весь
userland. После этого bootstrap test пересобирает assembler/linker и ОС.
```

### Состояние Prompt 10

Статус: **выполнено полностью**.

- `make.bin` разбирает `-f`, `-n`, target, переменные и continuation,
  сравнивает timestamps, прекращает сборку при ошибке и запускает рецепты
  только через `/bin/sh` внутри PCVM;
- отсутствующая зависимость собирается отдельным `/bin/make`, поэтому
  агрегатные цели обходят граф без host command dispatch;
- системный Makefile содержит libc, kernel, init, shell, userland и цели
  `toolchain/bootstrap`;
- `MAKE_STACK` обеспечивает обнаружение прямых и косвенных циклов графа;
  ненулевой статус дочернего `make` или recipe распространяется до корневого
  процесса и немедленно останавливает сборку;
- protected CLI-варианты `assembler.bin` и `linker.bin` получают аргументы из
  `ARGS`, читают и записывают файлы только через VFS syscalls; linker использует
  разнесённые рабочие области для объектов до 240 КиБ;
- `scripts/build-unix-staging.mjs` создаёт чистый 8-МиБ PCFS v2 staging image с
  toolchain, Assembly-исходниками, headers, библиотеками и системным Makefile;
- устранено перекрытие 64-КиБ source workspace с выходным PCVM payload
  self-hosted assembler;
- self-hosted assembler различает TEXT/DATA relocation для `LOAD_A..LOAD_D`,
  поэтому адреса kernel handlers корректно линкуются;
- bootstrap-тест реально запускает `linker2.bin`, затем собирает
  `assembler3.bin` и `linker3.bin` исключительно посредством
  `assembler2.bin + linker2.bin`; третье поколение собирает и исполняет
  контрольную программу.

Integration suite `test/unix-prompt10.test.js` загружает чистый staging image и
без host command dispatch запускает настоящий `/bin/make.bin`, `/bin/sh.bin`,
`/bin/assembler.bin`, `/bin/linker.bin` и Assembly-утилиты. Тест сначала
пересобирает и исполняет `hello.bin`, затем выполняет `/bin/make.bin -f Makefile
bootstrap` и проверяет PCVM magic и декодирование 24 результатов: toolchain
второго поколения, весь userland, kernel, init/logger и auth. На эталонной
машине тест занимает около 30 секунд и использует 2 МиБ RAM на процесс.

Воспроизводимая проверка:

```powershell
node scripts/generate-unix-toolchain-cli.mjs --check
node scripts/build-unix-make-env.mjs --check
node scripts/build-unix-staging.mjs --check
node --test test/unix-make-env.test.js test/unix-prompt10.test.js
```

## Prompt 11 — vi.bin

```text
Реализуй небольшой отдельный /bin/vi.bin на Assembly.

Режимы:
- normal;
- insert;
- command.

Минимум:
h/j/k/l, arrows при наличии key codes, i, a, x, dd, o, Esc,
:w, :q, :wq, :q!, поиск /pattern и n.

Используй text terminal syscall и input events. Модель файла должна работать
с файлами больше экрана: gap buffer или массив строк с bounded allocation.
Сохраняй через temporary file + rename, чтобы ошибка записи не уничтожала
исходник. Проверяй permissions и external modification timestamp.

Тесты подают детерминированную последовательность клавиш, затем сравнивают
файл и terminal snapshot. Не добавляй editor logic в JS UI или shell.
```

## Prompt 12 — debugger.bin

```text
Реализуй отдельный /bin/debugger.bin и минимальный безопасный kernel debug API.

Debugger может управлять только своим child либо процессом, разрешённым
policy. Нельзя отдавать userland kernel addresses.

Команды:
run file
break instruction_index
continue
step
regs
bt (по CALL stack, если доступно)
mem address length с проверкой user R permission
processes
quit

Kernel:
- stopped state;
- debug attach ownership;
- breakpoint как trap по instruction index без записи в R/X TEXT либо через
  kernel breakpoint table;
- single-step;
- sanitized context copy;
- detach/child exit cleanup.

Тесты: breakpoint hit, step через CALL/RET, invalid address, attach denial,
faulted child, debugger exit cleanup. Обнови security model OS.md.
```

## Prompt 13 — installer и установочная дискета

```text
Выполни этап 10 OS.md. Создай PCFD install image и installer.bin.

Дискета содержит:
- kernel.bin и source;
- init/sh/login/passwd;
- все utilities;
- assembler/linker/make и libraries/includes;
- /etc templates;
- manifest с path, size, checksum, uid, gid, mode;
- install.conf.

Installer работает как PCVM binary:
1. проверяет RAM/DRIVE;
2. предлагает target DRIVE;
3. форматирует новую VFS;
4. копирует по manifest с bounds/checksum;
5. создаёт каталоги;
6. назначает owner/mode;
7. предлагает root password;
8. создаёт guest опционально;
9. устанавливает boot target kernel.bin;
10. выполняет fs verification и сообщает результат.

Операция должна быть recoverable: incomplete install не помечается bootable.
Добавь unattended test config. Integration test начинает с пустого DRIVE,
устанавливает систему, перезагружает BIOS и доходит до login/sh.
```

## Prompt 14 — финальный hardening и release

```text
Выполни этапы 11–12 OS.md и не добавляй новые пользовательские функции, пока
не стабилизированы тесты.

Обязательные проверки:
- self-hosted rebuild всех binaries;
- clean install image → install → reboot → login → shell;
- filesystem corruption/fuzzed paths;
- invalid/overflowing syscall pointers;
- fd/process/PID exhaustion;
- OOM rollback;
- permissions и /etc/shadow;
- killed init child и restart limits;
- zombie/orphan cleanup;
- TIMER fairness;
- R/W/X, NX stack, guard;
- static/dynamic libraries;
- reproducible build manifest;
- PCVM v2 legacy compatibility без доступа к protected kernel API.

Запусти полный test suite, добавь отдельный Unix OS integration suite и
документируй время/память bootstrap. Удали временные host shortcuts либо
оставь их только под явно названным test/bootstrap flag. Обнови OS.md:
поставь выполненные этапы, перечисли известные ограничения и точную процедуру
сборки установочной дискеты.

Финальный отчёт должен содержать доказательства цепочки:
BIOS → kernel → init → login/sh → utility,
а также self-hosted source → assembler → linker → installed binary.
```

## Правила работы для всех промтов

DeepSeek на каждом этапе должен:

1. сначала читать актуальные документы и код, не полагаться на этот план как
   на доказательство уже реализованных функций;
2. сохранять существующую PCVM v2 compatibility;
3. не перенумеровывать опубликованные opcode/syscall;
4. не переносить Unix policy в JavaScript ради прохождения теста;
5. писать изменения небольшими проверяемыми слоями;
6. добавлять негативные тесты вместе с happy path;
7. обновлять `OS.md` фактическим состоянием, а не только планом;
8. запускать полный `npm.cmd test` после локальных тестов;
9. сохранять чужие изменения в рабочем дереве;
10. явно сообщать, что осталось host-side и почему это ещё не self-hosted;
11. создавать автоматизацию отдельными файлами `scripts/*`, никогда не
    запускать многострочный код через `node -e`, `python -c`, heredoc,
    here-string или длинный PowerShell command;
12. сначала показать/проверить созданный скрипт, затем запускать его короткой
    командой и отдельно проверять generated output.
