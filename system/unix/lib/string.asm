.export libc_memcpy
.export libc_memcmp
.export libc_strlen
.export libc_strcmp
.export libc_strncmp
.export libc_strcpy

.org 7100
str_ptr1: .dword 0
str_ptr2: .dword 0
str_limit: .dword 0
str_index: .dword 0
str_char: .dword 0

; B=destination, C=source, D=bytes, A=destination on return.
libc_memcpy:
MOV_A_B
PUSH_A
MOV_B_C
MOV_C_A
MEM_COPY
POP_A
RET

; B=left, C=right, D=bytes. A=-1/0/1.
libc_memcmp:
MEM_CMP
RET

; B=string, C=capacity. A=length or -1 when unterminated.
libc_strlen:
MOV_A_B
LOAD_B str_ptr1
STORE32_A_B
MOV_A_C
LOAD_B str_limit
STORE32_A_B
LOAD_A 0
LOAD_B str_index
STORE32_A_B
libc_strlen_loop:
LOAD_B str_index
LOAD32_A_B
MOV_D_A
LOAD_B str_limit
LOAD32_A_B
CMP_A_D
JZ libc_strlen_overflow
LOAD_B str_ptr1
LOAD32_A_B
PUSH_A
LOAD_B str_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
JZ libc_strlen_done
LOAD_B str_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP libc_strlen_loop
libc_strlen_done:
LOAD_B str_index
LOAD32_A_B
RET
libc_strlen_overflow:
LOAD_A -1
RET

; B=left, C=right, D=capacity. strcmp and strncmp share bounded semantics.
libc_strcmp:
libc_strncmp:
MOV_A_B
LOAD_B str_ptr1
STORE32_A_B
MOV_A_C
LOAD_B str_ptr2
STORE32_A_B
MOV_A_D
LOAD_B str_limit
STORE32_A_B
LOAD_A 0
LOAD_B str_index
STORE32_A_B
libc_strcmp_loop:
LOAD_B str_index
LOAD32_A_B
MOV_D_A
LOAD_B str_limit
LOAD32_A_B
CMP_A_D
JZ libc_strcmp_equal
LOAD_B str_ptr1
LOAD32_A_B
PUSH_A
LOAD_B str_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_B str_char
STORE32_A_B
PUSH_A
LOAD_B str_ptr2
LOAD32_A_B
PUSH_A
LOAD_B str_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
MOV_D_A
POP_A
CMP_A_D
JNZ libc_strcmp_diff
LOAD_B str_char
LOAD32_A_B
JZ libc_strcmp_equal
LOAD_B str_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP libc_strcmp_loop
libc_strcmp_diff:
SUB_A_D
RET
libc_strcmp_equal:
LOAD_A 0
RET

; B=destination, C=capacity, D=source. A=destination or -1.
libc_strcpy:
MOV_A_B
LOAD_B str_ptr1
STORE32_A_B
MOV_A_D
LOAD_B str_ptr2
STORE32_A_B
MOV_A_C
LOAD_B str_limit
STORE32_A_B
LOAD_A 0
LOAD_B str_index
STORE32_A_B
libc_strcpy_loop:
LOAD_B str_index
LOAD32_A_B
MOV_D_A
LOAD_B str_limit
LOAD32_A_B
CMP_A_D
JZ libc_strcpy_overflow
LOAD_B str_ptr2
LOAD32_A_B
PUSH_A
LOAD_B str_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
PUSH_A
LOAD_B str_ptr1
LOAD32_A_B
PUSH_A
LOAD_B str_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
POP_A
STORE8_A_B
JZ libc_strcpy_done
LOAD_B str_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP libc_strcpy_loop
libc_strcpy_done:
LOAD_B str_ptr1
LOAD32_A_B
RET
libc_strcpy_overflow:
LOAD_A -1
RET
