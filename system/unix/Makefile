# PCOS self-hosted userland build graph.
ASM=assembler
LINK=link

hello.bin: hello.asm
	$(ASM) hello.asm hello.obj
	$(LINK) hello.obj hello.bin

libc.obj: lib/crt0.asm lib/syscall.asm lib/string.asm lib/stdlib.asm lib/io.asm
	$(ASM) system/unix/build/libc.asm libc.obj

userland: libc.obj bin/sh.asm bin/env.asm bin/make.asm bin/top.asm
	$(ASM) bin/sh.asm sh.obj
	$(ASM) bin/env.asm env.obj
	$(ASM) bin/make.asm make.obj
	$(ASM) bin/top.asm top.obj

all: hello.bin userland
	echo userland-built
