; Рисует маркер в последней позиции мыши.
; Перед запуском кликните по терминалу и переместите указатель.
; Требуется GPU с режимом graphics.
.protected
LOAD_A 1
SYSCALL 0x42
SYSCALL 0x43
LOAD_A 0xffd166
LOAD_B 0
SYSCALL 0x44
SYSCALL 0x71
MOV_C_A
SYSCALL 0x72
MOV_D_A
MOV_A_C
MOV_B_D
LOAD_C 8
LOAD_D 1
SYSCALL 0x63
HALT
