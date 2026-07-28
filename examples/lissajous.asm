; Фигура Лиссажу: x = sin(3t), y = sin(2t + pi/2)
; Требуется графический GPU. Терминал имеет размер 420x420.
.protected
LOAD_A 1
SYSCALL 0x42
SYSCALL 0x43
LOAD_A 0x6fb7ff
LOAD_B 0
SYSCALL 0x44
SYSCALL 0x64

LOAD_A 0

draw:
; Сохраняем счётчик итераций в B.
MOV_B_A

; X = 210 + 170 * sin(3t), t = iteration * 2pi/256.
ITOF
LOAD_FB 0.0245436926
FMUL_FA_FB
LOAD_FB 3
FMUL_FA_FB
FSIN_FA
LOAD_FB 170
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_C_A

; Y = 210 + 170 * sin(2t + pi/2).
MOV_A_B
ITOF
LOAD_FB 0.0245436926
FMUL_FA_FB
LOAD_FB 2
FMUL_FA_FB
LOAD_FB 1.5707963268
FADD_FA_FB
FSIN_FA
LOAD_FB 170
FMUL_FA_FB
LOAD_FB 210
FADD_FA_FB
FTOI
MOV_D_A

; Рисуем точку в координатах C, D, сохраняя счётчик B на user stack.
MOV_A_B
PUSH_A
MOV_A_C
MOV_B_D
LOAD_C 2
LOAD_D 1
SYSCALL 0x63
LOAD_A 12
SYSCALL 0x65
POP_A
MOV_B_A

; Следующая из 256 точек.
MOV_A_B
INC_A
LOAD_B 256
CMP_A_B
JNZ draw
SYSCALL 0x66
HALT
