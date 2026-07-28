.export libc_getopt
.export libc_optind
.export libc_optarg

.org 7800
libc_optind: .dword 1
libc_optarg: .dword 0
getopt_argc: .dword 0
getopt_argv: .dword 0
getopt_options: .dword 0

; A=argc, B=argv (u32 pointers), C=NUL-terminated option characters.
; Supports Unix short options such as -a. Returns byte, '?' or -1.
libc_getopt:
PUSH_A
MOV_A_B
LOAD_B getopt_argv
STORE32_A_B
MOV_A_C
LOAD_B getopt_options
STORE32_A_B
POP_A
LOAD_B getopt_argc
STORE32_A_B
LOAD_B libc_optind
LOAD32_A_B
MOV_D_A
LOAD_B getopt_argc
LOAD32_A_B
CMP_A_D
JZ libc_getopt_done
; argv[optind]
LOAD_B libc_optind
LOAD32_A_B
LOAD_B 4
MUL_A_B
MOV_D_A
LOAD_B getopt_argv
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ libc_getopt_done
INC_B
LOAD8_A_B
PUSH_A
; advance optind before returning
LOAD_B libc_optind
LOAD32_A_B
INC_A
STORE32_A_B
POP_A
; Validate against the compact option string.
MOV_D_A
LOAD_B getopt_options
LOAD32_A_B
MOV_B_A
libc_getopt_scan:
LOAD8_A_B
JZ libc_getopt_unknown
CMP_A_D
JZ libc_getopt_found
INC_B
JMP libc_getopt_scan
libc_getopt_found:
MOV_A_D
RET
libc_getopt_unknown:
LOAD_A 63
RET
libc_getopt_done:
LOAD_A -1
RET
