; module crt0.asm
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

; module syscall.asm
; Thin Unix ABI wrappers. Arguments already occupy B/C/D unless documented.
.export libc_exit
.export libc_getpid
.export libc_getppid
.export libc_setuid
.export libc_setgid
.export libc_getuid
.export libc_getgid
.export libc_setsid
.export libc_spawn
.export libc_spawn_fds
.export libc_exec
.export libc_wait
.export libc_kill
.export libc_open
.export libc_read
.export libc_write
.export libc_close
.export libc_seek
.export libc_stat
.export libc_readdir
.export libc_mkdir
.export libc_unlink
.export libc_rename
.export libc_chmod
.export libc_chown
.export libc_getcwd
.export libc_chdir
.export libc_malloc
.export libc_free
.export libc_errno
.export libc_setenv
.export libc_getenv
.export libc_link

.org 7000
libc_errno: .dword 0

libc_capture_errno:
PUSH_A
MOV_A_D
JZ libc_capture_done
LOAD_B libc_errno
STORE32_A_B
libc_capture_done:
POP_A
RET

libc_exit:
SYSCALL 1
CALL libc_capture_errno
RET
libc_getpid:
SYSCALL 5
CALL libc_capture_errno
RET
libc_getppid:
SYSCALL 9
CALL libc_capture_errno
RET
libc_setuid:
SYSCALL 0x0b
CALL libc_capture_errno
RET
libc_setgid:
SYSCALL 0x0c
CALL libc_capture_errno
RET
libc_getuid:
SYSCALL 0x0d
CALL libc_capture_errno
RET
libc_getgid:
SYSCALL 0x0e
CALL libc_capture_errno
RET
libc_setsid:
SYSCALL 0x0f
CALL libc_capture_errno
RET
libc_spawn:
SYSCALL 3
CALL libc_capture_errno
RET
libc_spawn_fds:
SYSCALL 0x35
CALL libc_capture_errno
RET
libc_exec:
SYSCALL 8
CALL libc_capture_errno
RET
libc_wait:
SYSCALL 4
CALL libc_capture_errno
RET
libc_kill:
SYSCALL 6
CALL libc_capture_errno
RET
libc_open:
SYSCALL 0x20
CALL libc_capture_errno
RET
libc_read:
SYSCALL 0x21
CALL libc_capture_errno
RET
libc_write:
SYSCALL 0x22
CALL libc_capture_errno
RET
libc_close:
SYSCALL 0x23
CALL libc_capture_errno
RET
libc_seek:
SYSCALL 0x26
CALL libc_capture_errno
RET
libc_stat:
SYSCALL 0x27
CALL libc_capture_errno
RET
libc_readdir:
SYSCALL 0x28
CALL libc_capture_errno
RET
libc_mkdir:
SYSCALL 0x29
CALL libc_capture_errno
RET
libc_unlink:
SYSCALL 0x2a
CALL libc_capture_errno
RET
libc_rename:
SYSCALL 0x2b
CALL libc_capture_errno
RET
libc_chmod:
SYSCALL 0x2c
CALL libc_capture_errno
RET
libc_chown:
SYSCALL 0x2d
CALL libc_capture_errno
RET
libc_getcwd:
SYSCALL 0x2e
CALL libc_capture_errno
RET
libc_chdir:
SYSCALL 0x2f
CALL libc_capture_errno
RET
libc_malloc:
SYSCALL 0x10
CALL libc_capture_errno
RET
libc_free:
SYSCALL 0x11
CALL libc_capture_errno
RET
; B=key, C=value, D=(value_len<<16)|key_len.
libc_setenv:
SYSCALL 0x32
CALL libc_capture_errno
RET
; B=key, C=output, D=(capacity<<16)|key_len.
libc_getenv:
SYSCALL 0x33
CALL libc_capture_errno
RET
; B=old path, C=old length, D=(new_len<<16)|new_offset_from_B.
libc_link:
SYSCALL 0x34
CALL libc_capture_errno
RET

; module string.asm
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

; module stdlib.asm
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

; module io.asm
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

; module path.asm
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

; module getopt.asm
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
