.export libc_parse_int
.export libc_format_int
.export libc_format_hex

.org 7200
fmt_value: .dword 0
fmt_buffer: .dword 0
fmt_capacity: .dword 0
fmt_count: .dword 0
fmt_base: .dword 10
fmt_original: .dword 0
fmt_quotient: .dword 0

; B=text, C=length. A=signed decimal/hex value, D=0 or -EINVAL.
libc_parse_int:
STR_TO_INT
LOAD_D 0
RET

; B=value, C=buffer, D=capacity. A=written bytes, no trailing NUL.
libc_format_int:
MOV_A_B
PUSH_A
LOAD_A 10
LOAD_B fmt_base
STORE32_A_B
POP_A
MOV_B_A
JMP libc_format_unsigned

libc_format_hex:
MOV_A_B
PUSH_A
LOAD_A 16
LOAD_B fmt_base
STORE32_A_B
POP_A
MOV_B_A

libc_format_unsigned:
MOV_A_B
LOAD_B fmt_value
STORE32_A_B
MOV_A_C
LOAD_B fmt_buffer
STORE32_A_B
MOV_A_D
LOAD_B fmt_capacity
STORE32_A_B
LOAD_A 0
LOAD_B fmt_count
STORE32_A_B

LOAD_B fmt_value
LOAD32_A_B
JNZ libc_format_digits
LOAD_A 48
PUSH_A
LOAD_A 1
LOAD_B fmt_count
STORE32_A_B
JMP libc_format_emit

libc_format_digits:
LOAD_B fmt_value
LOAD32_A_B
LOAD_B fmt_original
STORE32_A_B
LOAD_B fmt_base
LOAD32_A_B
MOV_D_A
LOAD_B fmt_original
LOAD32_A_B
MOV_B_D
DIV_A_B
LOAD_B fmt_quotient
STORE32_A_B
; remainder = original - quotient * base
LOAD_B fmt_base
LOAD32_A_B
MOV_D_A
LOAD_B fmt_quotient
LOAD32_A_B
MOV_B_D
MUL_A_B
MOV_D_A
LOAD_B fmt_original
LOAD32_A_B
SUB_A_D
LOAD_D 10
CMP_A_D
JNZ libc_format_decimal_digit
libc_format_decimal_digit:
; 0..9 use '0', 10..15 use 'a'-10.
MOV_D_A
LOAD_A 10
CMP_A_D
JZ libc_format_alpha_digit
LOAD_A 48
MOV_B_D
ADD_A_B
JMP libc_format_push
libc_format_alpha_digit:
MOV_A_D
LOAD_B 87
ADD_A_B
libc_format_push:
PUSH_A
LOAD_B fmt_count
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B fmt_quotient
LOAD32_A_B
LOAD_B fmt_value
STORE32_A_B
LOAD_B fmt_quotient
LOAD32_A_B
JNZ libc_format_digits

libc_format_emit:
LOAD_B fmt_count
LOAD32_A_B
MOV_D_A
LOAD_B fmt_capacity
LOAD32_A_B
CMP_A_D
JZ libc_format_overflow
LOAD_A 0
LOAD_B fmt_original
STORE32_A_B
libc_format_emit_loop:
LOAD_B fmt_original
LOAD32_A_B
MOV_D_A
LOAD_B fmt_count
LOAD32_A_B
CMP_A_D
JZ libc_format_done
POP_A
PUSH_A
LOAD_B fmt_buffer
LOAD32_A_B
PUSH_A
LOAD_B fmt_original
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
POP_A
STORE8_A_B
LOAD_B fmt_original
LOAD32_A_B
INC_A
STORE32_A_B
JMP libc_format_emit_loop
libc_format_done:
LOAD_B fmt_count
LOAD32_A_B
LOAD_D 0
RET
libc_format_overflow:
LOAD_A -1
LOAD_D -7
RET
