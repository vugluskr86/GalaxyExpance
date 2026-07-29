.protected
.export main
.import libc_puts
.import libc_format_int

; Compact process listing utility. PROCESS_LIST remains the authoritative,
; bounded kernel snapshot; top.bin provides the continuously refreshed view.
main:
LOAD_B ps_pids
LOAD_C 256
SYSCALL 0x07
LOAD_D -1
CMP_A_D
JZ ps_error
LOAD_B 4
DIV_A_B
MOV_B_A
LOAD_C ps_count
LOAD_D 16
CALL libc_format_int
MOV_C_A
LOAD_B ps_prefix
CALL libc_puts
LOAD_B ps_count
CALL libc_puts
LOAD_B ps_suffix
LOAD_C 9
CALL libc_puts
LOAD_A 0
RET
ps_error:
LOAD_B ps_error_text
LOAD_C 10
CALL libc_puts
LOAD_A 1
RET

.org 8700
ps_pids: .zero 256
ps_count: .zero 16
ps_prefix: .string "processes: "
ps_suffix: .string " snapshot\n"
ps_error_text: .string "ps: error\n"
