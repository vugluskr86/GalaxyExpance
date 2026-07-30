# PCOS self-hosted userland build graph.
# Используется make.bin внутри PCVM.
# Запуск: make [-f file] [target]
ASM=assembler.bin
LINK=linker.bin
LIBC_BUILD=system/unix/build/libc.asm
LIBC_SRC=lib/crt0.asm lib/syscall.asm lib/string.asm lib/stdlib.asm lib/io.asm lib/path.asm lib/getopt.asm
KERNEL_SRC=kernel/entry.asm kernel/syscall.asm kernel/process.asm kernel/scheduler.asm kernel/memory.asm kernel/vfs.asm kernel/permissions.asm kernel/devices.asm

# ======== Stage 1: libc ========
build/libc.asm: lib/crt0.asm lib/syscall.asm lib/string.asm lib/stdlib.asm lib/io.asm lib/path.asm lib/getopt.asm
	cat.bin lib/crt0.asm > build/libc.asm ; \
	cat.bin lib/syscall.asm >> build/libc.asm ; \
	cat.bin lib/string.asm >> build/libc.asm ; \
	cat.bin lib/stdlib.asm >> build/libc.asm ; \
	cat.bin lib/io.asm >> build/libc.asm ; \
	cat.bin lib/path.asm >> build/libc.asm ; \
	cat.bin lib/getopt.asm >> build/libc.asm

libc.obj: build/libc.asm
	$(ASM) build/libc.asm ; mv.bin a.obj libc.obj

# ======== Stage 2: hello (smoke test) ========
build/hello.asm: build/libc.asm hello.asm
	cat.bin build/libc.asm > build/hello.asm ; cat.bin hello.asm >> build/hello.asm

hello.obj: build/hello.asm
	$(ASM) build/hello.asm ; mv.bin a.obj hello.obj

hello.bin: hello.obj
	$(LINK) hello.obj ; mv.bin a.bin hello.bin

# ======== Stage 3: core utilities ========
build/env.asm: build/libc.asm bin/env.asm
	cat.bin build/libc.asm > build/env.asm ; cat.bin bin/env.asm >> build/env.asm

env.obj: build/env.asm
	$(ASM) build/env.asm ; mv.bin a.obj env.obj

env.bin: env.obj
	$(LINK) env.obj ; mv.bin a.bin env.bin

build/make.asm: build/libc.asm bin/make.asm
	cat.bin build/libc.asm > build/make.asm ; cat.bin bin/make.asm >> build/make.asm

make.obj: build/make.asm
	$(ASM) build/make.asm ; mv.bin a.obj make.obj

make.bin: make.obj
	$(LINK) make.obj ; mv.bin a.bin make.bin

build/shell-lib.asm: build/libc.asm lib/shell-parser.asm
	cat.bin build/libc.asm > build/shell-lib.asm ; cat.bin lib/shell-parser.asm >> build/shell-lib.asm

build/sh.asm: build/shell-lib.asm bin/sh.asm
	cat.bin build/shell-lib.asm > build/sh.asm ; cat.bin bin/sh.asm >> build/sh.asm

sh.obj: build/sh.asm
	$(ASM) build/sh.asm ; mv.bin a.obj sh.obj

sh.bin: sh.obj
	$(LINK) sh.obj ; mv.bin a.bin sh.bin

build/utilities-lib.asm: build/libc.asm lib/utilities.asm
	cat.bin build/libc.asm > build/utilities-lib.asm ; cat.bin lib/utilities.asm >> build/utilities-lib.asm

build/ls.asm: build/utilities-lib.asm bin/ls.asm
	cat.bin build/utilities-lib.asm > build/ls.asm ; cat.bin bin/ls.asm >> build/ls.asm

ls.obj: build/ls.asm
	$(ASM) build/ls.asm ; mv.bin a.obj ls.obj

ls.bin: ls.obj
	$(LINK) ls.obj ; mv.bin a.bin ls.bin

build/cat.asm: build/utilities-lib.asm bin/cat.asm
	cat.bin build/utilities-lib.asm > build/cat.asm ; cat.bin bin/cat.asm >> build/cat.asm

cat.obj: build/cat.asm
	$(ASM) build/cat.asm ; mv.bin a.obj cat.obj

cat.bin: cat.obj
	$(LINK) cat.obj ; mv.bin a.bin cat.bin

build/grep.asm: build/utilities-lib.asm bin/grep.asm
	cat.bin build/utilities-lib.asm > build/grep.asm ; cat.bin bin/grep.asm >> build/grep.asm

grep.obj: build/grep.asm
	$(ASM) build/grep.asm ; mv.bin a.obj grep.obj

grep.bin: grep.obj
	$(LINK) grep.obj ; mv.bin a.bin grep.bin

build/cp.asm: build/utilities-lib.asm bin/cp.asm
	cat.bin build/utilities-lib.asm > build/cp.asm ; cat.bin bin/cp.asm >> build/cp.asm

cp.obj: build/cp.asm
	$(ASM) build/cp.asm ; mv.bin a.obj cp.obj

cp.bin: cp.obj
	$(LINK) cp.obj ; mv.bin a.bin cp.bin

build/mv.asm: build/utilities-lib.asm bin/mv.asm
	cat.bin build/utilities-lib.asm > build/mv.asm ; cat.bin bin/mv.asm >> build/mv.asm

mv.obj: build/mv.asm
	$(ASM) build/mv.asm ; mv.bin a.obj mv.obj

mv.bin: mv.obj
	$(LINK) mv.obj ; mv.bin a.bin mv.bin

build/mkdir.asm: build/utilities-lib.asm bin/mkdir.asm
	cat.bin build/utilities-lib.asm > build/mkdir.asm ; cat.bin bin/mkdir.asm >> build/mkdir.asm

mkdir.obj: build/mkdir.asm
	$(ASM) build/mkdir.asm ; mv.bin a.obj mkdir.obj

mkdir.bin: mkdir.obj
	$(LINK) mkdir.obj ; mv.bin a.bin mkdir.bin

build/rm.asm: build/utilities-lib.asm bin/rm.asm
	cat.bin build/utilities-lib.asm > build/rm.asm ; cat.bin bin/rm.asm >> build/rm.asm

rm.obj: build/rm.asm
	$(ASM) build/rm.asm ; mv.bin a.obj rm.obj

rm.bin: rm.obj
	$(LINK) rm.obj ; mv.bin a.bin rm.bin

build/link-util.asm: build/utilities-lib.asm bin/link.asm
	cat.bin build/utilities-lib.asm > build/link-util.asm ; cat.bin bin/link.asm >> build/link-util.asm

link-util.obj: build/link-util.asm
	$(ASM) build/link-util.asm ; mv.bin a.obj link-util.obj

link-util.bin: link-util.obj
	$(LINK) link-util.obj ; mv.bin a.bin link-util.bin

build/top.asm: build/libc.asm bin/top.asm
	cat.bin build/libc.asm > build/top.asm ; cat.bin bin/top.asm >> build/top.asm

top.obj: build/top.asm
	$(ASM) build/top.asm ; mv.bin a.obj top.obj

top.bin: top.obj
	$(LINK) top.obj ; mv.bin a.bin top.bin

build/ps.asm: build/libc.asm bin/ps.asm
	cat.bin build/libc.asm > build/ps.asm ; cat.bin bin/ps.asm >> build/ps.asm

ps.obj: build/ps.asm
	$(ASM) build/ps.asm ; mv.bin a.obj ps.obj

ps.bin: ps.obj
	$(LINK) ps.obj ; mv.bin a.bin ps.bin

build/find.asm: build/utilities-lib.asm bin/find.asm
	cat.bin build/utilities-lib.asm > build/find.asm ; cat.bin bin/find.asm >> build/find.asm

find.obj: build/find.asm
	$(ASM) build/find.asm ; mv.bin a.obj find.obj

find.bin: find.obj
	$(LINK) find.obj ; mv.bin a.bin find.bin

build/chown.asm: build/utilities-lib.asm bin/chown.asm
	cat.bin build/utilities-lib.asm > build/chown.asm ; cat.bin bin/chown.asm >> build/chown.asm

chown.obj: build/chown.asm
	$(ASM) build/chown.asm ; mv.bin a.obj chown.obj

chown.bin: chown.obj
	$(LINK) chown.obj ; mv.bin a.bin chown.bin

build/chgrp.asm: build/utilities-lib.asm bin/chgrp.asm
	cat.bin build/utilities-lib.asm > build/chgrp.asm ; cat.bin bin/chgrp.asm >> build/chgrp.asm

chgrp.obj: build/chgrp.asm
	$(ASM) build/chgrp.asm ; mv.bin a.obj chgrp.obj

chgrp.bin: chgrp.obj
	$(LINK) chgrp.obj ; mv.bin a.bin chgrp.bin

build/user.asm: build/utilities-lib.asm bin/user.asm
	cat.bin build/utilities-lib.asm > build/user.asm ; cat.bin bin/user.asm >> build/user.asm

user.obj: build/user.asm
	$(ASM) build/user.asm ; mv.bin a.obj user.obj

user.bin: user.obj
	$(LINK) user.obj ; mv.bin a.bin user.bin

build/userdb-lib.asm: build/libc.asm lib/userdb.asm
	cat.bin build/libc.asm > build/userdb-lib.asm ; cat.bin lib/userdb.asm >> build/userdb-lib.asm

build/login.asm: build/userdb-lib.asm bin/login.asm
	cat.bin build/userdb-lib.asm > build/login.asm ; cat.bin bin/login.asm >> build/login.asm

login.obj: build/login.asm
	$(ASM) build/login.asm ; mv.bin a.obj login.obj

login.bin: login.obj
	$(LINK) login.obj ; mv.bin a.bin login.bin

build/passwd.asm: build/userdb-lib.asm bin/passwd.asm
	cat.bin build/userdb-lib.asm > build/passwd.asm ; cat.bin bin/passwd.asm >> build/passwd.asm

passwd.obj: build/passwd.asm
	$(ASM) build/passwd.asm ; mv.bin a.obj passwd.obj

passwd.bin: passwd.obj
	$(LINK) passwd.obj ; mv.bin a.bin passwd.bin

# ======== Applications (/usr/bin) ========
# scanner.bin is pre-built by the host-side C compiler (scripts/build-unix-stage7-8.mjs).
# It is not rebuildable inside PCVM until the in-game C compiler is available.

# ======== Stage 4: kernel ========
build/kernel.asm: kernel/entry.asm kernel/syscall.asm kernel/process.asm kernel/scheduler.asm kernel/memory.asm kernel/vfs.asm kernel/permissions.asm kernel/devices.asm
	cat.bin kernel/entry.asm > build/kernel.asm ; \
	cat.bin kernel/syscall.asm >> build/kernel.asm ; \
	cat.bin kernel/process.asm >> build/kernel.asm ; \
	cat.bin kernel/scheduler.asm >> build/kernel.asm ; \
	cat.bin kernel/memory.asm >> build/kernel.asm ; \
	cat.bin kernel/vfs.asm >> build/kernel.asm ; \
	cat.bin kernel/permissions.asm >> build/kernel.asm ; \
	cat.bin kernel/devices.asm >> build/kernel.asm

kernel.obj: build/kernel.asm
	$(ASM) build/kernel.asm ; mv.bin a.obj kernel.obj

kernel.bin: kernel.obj
	$(LINK) kernel.obj ; mv.bin a.bin kernel.bin

# ======== Stage 5: services ========
build/init.asm: build/libc.asm init/init.asm
	cat.bin build/libc.asm > build/init.asm ; cat.bin init/init.asm >> build/init.asm

init.obj: build/init.asm
	$(ASM) build/init.asm ; mv.bin a.obj init.obj

init.bin: init.obj
	$(LINK) init.obj ; mv.bin a.bin init.bin

build/logger.asm: build/libc.asm sbin/logger.asm
	cat.bin build/libc.asm > build/logger.asm ; cat.bin sbin/logger.asm >> build/logger.asm

logger.obj: build/logger.asm
	$(ASM) build/logger.asm ; mv.bin a.obj logger.obj

logger.bin: logger.obj
	$(LINK) logger.obj ; mv.bin a.bin logger.bin

# ======== Aggregate targets ========
baseline: hello.bin env.bin make.bin sh.bin

userland: hello.bin env.bin make.bin sh.bin ls.bin cat.bin grep.bin cp.bin mv.bin mkdir.bin rm.bin link-util.bin top.bin ps.bin find.bin chown.bin chgrp.bin user.bin scanner.bin

system: kernel.bin init.bin logger.bin

auth: login.bin passwd.bin

all: userland system auth

# ======== Bootstrap: self-hosted toolchain rebuild ========
assembler2.obj: ../../system/assembler.asm
	$(ASM) ../../system/assembler.asm ; mv.bin a.obj assembler2.obj

assembler2.bin: assembler2.obj
	$(LINK) assembler2.obj ; mv.bin a.bin assembler2.bin

linker2.obj: ../../system/linker.asm
	$(ASM) ../../system/linker.asm ; mv.bin a.obj linker2.obj

linker2.bin: linker2.obj
	$(LINK) linker2.obj ; mv.bin a.bin linker2.bin

toolchain: assembler2.bin linker2.bin

bootstrap: toolchain all

# ======== Clean ========
clean:
	rm.bin *.obj *.bin

.PHONY: clean bootstrap all userland system auth baseline toolchain
