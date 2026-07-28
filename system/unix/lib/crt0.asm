; PCOS user entry ABI: A=argc, B=argv, C=envp, D=auxv (reserved).
; A-D are caller-saved. Return value is A, errno is negative D.
.protected
.export _start
.import main
.import libc_exit

_start:
CALL main
CALL libc_exit
HALT
