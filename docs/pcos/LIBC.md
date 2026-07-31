> **Статус документа:** перенесён и сверён со структурой проекта 31 июля 2026 года. Плановые пункты не считаются реализованными без подтверждения исходниками и тестами.

# PCOS libc calling convention

PCVM user entry receives `A=argc`, `B=argv`, `C=envp`, `D=auxv/reserved`.
`argv` and `envp` are user-virtual pointers to little-endian `u32` pointer
arrays terminated by zero.

Functions use `B`, `C`, `D` for up to three arguments and return a value in
`A`. Registers `A–D`, floating registers and vector registers are caller-saved.
The hardware return stack belongs to `CALL/RET`; temporary integer values may
use balanced `PUSH_A/POP_A`.

Syscall wrappers return the kernel result in `A` and preserve the negative
kernel errno in `D`. They also copy `D` to per-process `libc_errno`.

`_start` calls `main(argc, argv, envp)` without changing the entry registers,
then passes `main`'s return value to `exit`.
