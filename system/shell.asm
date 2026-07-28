; Pixel Shell — разбор команд выполняется этим машинным кодом.
; Буфер строки: 1024..1279, буфер вывода: 2048..3071.
.protected
LOAD_A 0
SYSCALL 0x42
PRINT "Pixel Shell ASM 1.0"
PRINT "help — команды"

shell_loop:
LOAD_B 1024
LOAD_C 256
SYSCALL 0x40
LOAD_B -1
CMP_A_B
JZ shell_wait

; Получить нулевой токен и вычислить FNV-1a.
MOV_C_A
LOAD_D 0
LOAD_B 1024
STR_TOKEN
MOV_C_A
STR_HASH

LOAD_B 946971642
CMP_A_B
JZ cmd_help
LOAD_B 1446109160
CMP_A_B
JZ cmd_ls
LOAD_B 1582198420
CMP_A_B
JZ cmd_ps
LOAD_B -894608386
CMP_A_B
JZ cmd_mem
LOAD_B 1550717474
CMP_A_B
JZ cmd_clear
LOAD_B 718098122
CMP_A_B
JZ cmd_run
LOAD_B -988854887
CMP_A_B
JZ cmd_kill
PRINT "Команда не найдена"
JMP shell_loop

cmd_help:
PRINT "help ls ps mem clear run <file> kill <pid>"
JMP shell_loop

cmd_ls:
LOAD_B 2048
LOAD_C 1024
SYSCALL 0x24
MOV_C_A
LOAD_B 2048
SYSCALL 0x41
JMP shell_loop

cmd_ps:
LOAD_B 2048
LOAD_C 1024
SYSCALL 0x07
MOV_C_A
LOAD_B 2048
SYSCALL 0x41
JMP shell_loop

cmd_mem:
SYSCALL 0x12
PRINT "Свободно RAM, байт:"
PRINT_A
MOV_A_B
PRINT "Всего RAM, байт:"
PRINT_A
JMP shell_loop

cmd_clear:
SYSCALL 0x43
JMP shell_loop

cmd_run:
; Второй токен — имя исполняемого файла.
LOAD_B 1024
LOAD_C 256
LOAD_D 1
STR_TOKEN
JZ shell_usage_run
MOV_C_A
SYSCALL 0x03
PRINT "PID:"
PRINT_A
JMP shell_loop
shell_usage_run:
PRINT "run <file.bin>"
JMP shell_loop

cmd_kill:
LOAD_B 1024
LOAD_C 256
LOAD_D 1
STR_TOKEN
JZ shell_usage_kill
MOV_C_A
STR_TO_INT
SYSCALL 0x06
PRINT_A
JMP shell_loop
shell_usage_kill:
PRINT "kill <pid>"
JMP shell_loop

shell_wait:
SYSCALL 0x02
JMP shell_loop
