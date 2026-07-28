.export libc_path_join
.import libc_strlen

.org 7900
path_dest: .dword 0
path_capacity: .dword 0
path_right: .dword 0
path_index: .dword 0

; B=destination containing a NUL-terminated left side, C=capacity,
; D=NUL-terminated right component. Returns new length or -1.
libc_path_join:
MOV_A_B
LOAD_B path_dest
STORE32_A_B
MOV_A_C
LOAD_B path_capacity
STORE32_A_B
MOV_A_D
LOAD_B path_right
STORE32_A_B
LOAD_B path_dest
LOAD32_A_B
PUSH_A
LOAD_B path_capacity
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
CALL libc_strlen
LOAD_D -1
CMP_A_D
JZ libc_path_overflow
LOAD_B path_index
STORE32_A_B
; append '/'
LOAD_B path_dest
LOAD32_A_B
PUSH_A
LOAD_B path_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD_A 47
STORE8_A_B
LOAD_B path_index
LOAD32_A_B
INC_A
STORE32_A_B
libc_path_copy:
LOAD_B path_index
LOAD32_A_B
MOV_D_A
LOAD_B path_capacity
LOAD32_A_B
CMP_A_D
JZ libc_path_overflow
LOAD_B path_right
LOAD32_A_B
PUSH_A
LOAD_B path_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
; right offset is total index minus left length minus slash. Reuse a
; monotonically advanced right pointer instead.
LOAD8_A_B
PUSH_A
LOAD_B path_dest
LOAD32_A_B
PUSH_A
LOAD_B path_index
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
POP_A
STORE8_A_B
JZ libc_path_done
LOAD_B path_right
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B path_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP libc_path_copy
libc_path_done:
LOAD_B path_index
LOAD32_A_B
RET
libc_path_overflow:
LOAD_A -1
LOAD_D -7
RET
