.export libc_puts
.export libc_printf
.export libc_fread
.export libc_fwrite
.export libc_fflush
.import libc_format_int
.import libc_format_hex

.org 7600
io_fd: .dword 0
io_ptr: .dword 0
io_left: .dword 0
io_total: .dword 0
printf_arg: .dword 0
printf_format: .dword 0
printf_buffer: .zero 16

; B=text, C=bytes.
libc_puts:
SYSCALL 0x41
RET

; B=format, C=format bytes, D=argument block.
; Minimal formats: literal text, %s ([ptr,len]), %d ([i32]), %x ([u32]).
libc_printf:
MOV_A_B
LOAD_B printf_format
STORE32_A_B
MOV_A_D
LOAD_B printf_arg
STORE32_A_B
LOAD_B printf_format
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 37
CMP_A_D
JNZ libc_puts
INC_B
LOAD8_A_B
LOAD_D 115
CMP_A_D
JZ libc_printf_string
LOAD_D 100
CMP_A_D
JZ libc_printf_decimal
LOAD_D 120
CMP_A_D
JZ libc_printf_hex
LOAD_A -1
LOAD_D -22
RET
libc_printf_string:
LOAD_B printf_arg
LOAD32_A_B
MOV_B_A
LOAD_D 4
ADD_B_D
LOAD32_A_B
MOV_C_A
LOAD_B printf_arg
LOAD32_A_B
MOV_B_A
LOAD32_A_B
MOV_B_A
CALL libc_puts
RET
libc_printf_decimal:
LOAD_B printf_arg
LOAD32_A_B
MOV_B_A
LOAD32_A_B
MOV_B_A
LOAD_C printf_buffer
LOAD_D 16
CALL libc_format_int
JMP libc_printf_number
libc_printf_hex:
LOAD_B printf_arg
LOAD32_A_B
MOV_B_A
LOAD32_A_B
MOV_B_A
LOAD_C printf_buffer
LOAD_D 16
CALL libc_format_hex
libc_printf_number:
MOV_C_A
LOAD_B printf_buffer
CALL libc_puts
RET

; B=fd, C=buffer, D=bytes.
libc_fread:
SYSCALL 0x21
RET

; B=fd, C=buffer, D=bytes. Repeats short writes until complete/error.
libc_fwrite:
MOV_A_B
LOAD_B io_fd
STORE32_A_B
MOV_A_C
LOAD_B io_ptr
STORE32_A_B
MOV_A_D
LOAD_B io_left
STORE32_A_B
LOAD_A 0
LOAD_B io_total
STORE32_A_B
libc_fwrite_loop:
LOAD_B io_left
LOAD32_A_B
JZ libc_fwrite_done
MOV_D_A
LOAD_B io_fd
LOAD32_A_B
PUSH_A
LOAD_B io_ptr
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
SYSCALL 0x22
LOAD_D 0
CMP_A_D
JZ libc_fwrite_error
MOV_D_A
LOAD_B io_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
MOV_A_B
LOAD_B io_ptr
STORE32_A_B
LOAD_B io_left
LOAD32_A_B
SUB_A_D
STORE32_A_B
LOAD_B io_total
LOAD32_A_B
MOV_B_D
ADD_A_B
LOAD_B io_total
STORE32_A_B
JMP libc_fwrite_loop
libc_fwrite_done:
LOAD_B io_total
LOAD32_A_B
LOAD_D 0
RET
libc_fwrite_error:
LOAD_A -1
RET

libc_fflush:
LOAD_A 0
LOAD_D 0
RET
