# PCOS self-hosted userland build graph.
# Используется make.bin внутри PCVM.
# Запуск: make [-f file] [target]
ASM=assembler
LINK=link
LIBC_BUILD=system/unix/build/libc.asm
LIBC_SRC=lib/crt0.asm lib/syscall.asm lib/string.asm lib/stdlib.asm lib/io.asm lib/path.asm lib/getopt.asm lib/userdb.asm lib/utilities.asm lib/shell-parser.asm
KERNEL_SRC=kernel/entry.asm kernel/syscall.asm kernel/process.asm kernel/scheduler.asm kernel/memory.asm kernel/vfs.asm kernel/permissions.asm kernel/devices.asm

# ======== Stage 1: libc ========
$(LIBC_BUILD): $(LIBC_SRC)
	cat $(LIBC_SRC) > $(LIBC_BUILD)

libc.obj: $(LIBC_BUILD)
	$(ASM) $(LIBC_BUILD) libc.obj

# ======== Stage 2: hello (smoke test) ========
hello.obj: hello.asm
	$(ASM) hello.asm hello.obj

hello.bin: hello.obj libc.obj
	$(LINK) hello.obj libc.obj hello.bin

# ======== Stage 3: core utilities ========
env.obj: bin/env.asm
	$(ASM) bin/env.asm env.obj

env.bin: env.obj libc.obj
	$(LINK) env.obj libc.obj env.bin

make.obj: bin/make.asm
	$(ASM) bin/make.asm make.obj

make.bin: make.obj libc.obj
	$(LINK) make.obj libc.obj make.bin

sh.obj: bin/sh.asm
	$(ASM) bin/sh.asm sh.obj

sh.bin: sh.obj libc.obj
	$(LINK) sh.obj libc.obj sh.bin

ls.obj: bin/ls.asm
	$(ASM) bin/ls.asm ls.obj

ls.bin: ls.obj libc.obj
	$(LINK) ls.obj libc.obj ls.bin

cat.obj: bin/cat.asm
	$(ASM) bin/cat.asm cat.obj

cat.bin: cat.obj libc.obj
	$(LINK) cat.obj libc.obj cat.bin

grep.obj: bin/grep.asm
	$(ASM) bin/grep.asm grep.obj

grep.bin: grep.obj libc.obj
	$(LINK) grep.obj libc.obj grep.bin

cp.obj: bin/cp.asm
	$(ASM) bin/cp.asm cp.obj

cp.bin: cp.obj libc.obj
	$(LINK) cp.obj libc.obj cp.bin

mv.obj: bin/mv.asm
	$(ASM) bin/mv.asm mv.obj

mv.bin: mv.obj libc.obj
	$(LINK) mv.obj libc.obj mv.bin

mkdir.obj: bin/mkdir.asm
	$(ASM) bin/mkdir.asm mkdir.obj

mkdir.bin: mkdir.obj libc.obj
	$(LINK) mkdir.obj libc.obj mkdir.bin

rm.obj: bin/rm.asm
	$(ASM) bin/rm.asm rm.obj

rm.bin: rm.obj libc.obj
	$(LINK) rm.obj libc.obj rm.bin

link-util.obj: bin/link.asm
	$(ASM) bin/link.asm link-util.obj

link-util.bin: link-util.obj libc.obj
	$(LINK) link-util.obj libc.obj link-util.bin

top.obj: bin/top.asm
	$(ASM) bin/top.asm top.obj

top.bin: top.obj libc.obj
	$(LINK) top.obj libc.obj top.bin

find.obj: bin/find.asm
	$(ASM) bin/find.asm find.obj

find.bin: find.obj libc.obj
	$(LINK) find.obj libc.obj find.bin

chown.obj: bin/chown.asm
	$(ASM) bin/chown.asm chown.obj

chown.bin: chown.obj libc.obj
	$(LINK) chown.obj libc.obj chown.bin

chgrp.obj: bin/chgrp.asm
	$(ASM) bin/chgrp.asm chgrp.obj

chgrp.bin: chgrp.obj libc.obj
	$(LINK) chgrp.obj libc.obj chgrp.bin

user.obj: bin/user.asm
	$(ASM) bin/user.asm user.obj

user.bin: user.obj libc.obj
	$(LINK) user.obj libc.obj user.bin

login.obj: bin/login.asm
	$(ASM) bin/login.asm login.obj

login.bin: login.obj libc.obj lib/userdb.asm
	$(LINK) login.obj libc.obj login.bin

passwd.obj: bin/passwd.asm
	$(ASM) bin/passwd.asm passwd.obj

passwd.bin: passwd.obj libc.obj
	$(LINK) passwd.obj libc.obj passwd.bin

# ======== Stage 4: kernel ========
kernel.obj: $(KERNEL_SRC)
	$(ASM) kernel/entry.asm kernel/entry.obj

kernel.bin: kernel.obj libc.obj
	$(LINK) kernel.obj libc.obj kernel.bin

# ======== Stage 5: services ========
init.obj: init/init.asm
	$(ASM) init/init.asm init.obj

init.bin: init.obj libc.obj
	$(LINK) init.obj libc.obj init.bin

logger.obj: sbin/logger.asm
	$(ASM) sbin/logger.asm logger.obj

logger.bin: logger.obj libc.obj
	$(LINK) logger.obj libc.obj logger.bin

# ======== Aggregate targets ========
baseline: hello.bin env.bin make.bin sh.bin

userland: hello.bin env.bin make.bin sh.bin ls.bin cat.bin grep.bin cp.bin mv.bin mkdir.bin rm.bin link-util.bin top.bin find.bin chown.bin chgrp.bin user.bin

system: kernel.bin init.bin logger.bin

auth: login.bin passwd.bin

all: userland system auth
	echo userland-built

# ======== Bootstrap: self-hosted toolchain rebuild ========
assembler2.obj: ../../system/assembler.asm
	$(ASM) ../../system/assembler.asm assembler2.obj

assembler2.bin: assembler2.obj
	$(LINK) assembler2.obj assembler2.bin

linker2.obj: ../../system/linker.asm
	$(ASM) ../../system/linker.asm linker2.obj

linker2.bin: linker2.obj
	$(LINK) linker2.obj linker2.bin

toolchain: assembler2.bin linker2.bin

bootstrap: toolchain all
	echo bootstrap-complete

# ======== Clean ========
clean:
	rm *.obj *.bin

.PHONY: clean bootstrap all userland system auth baseline toolchain
