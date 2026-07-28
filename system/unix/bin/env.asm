.protected
.export main
.import libc_puts
.import libc_spawn
.import libc_wait
.import libc_setenv

main:
LOAD_A 1
CALL env_arg
JZ env_list
PUSH_A
MOV_A_B
LOAD_B env_arg_ptr
STORE32_A_B
POP_A
LOAD_B env_arg_len
STORE32_A_B
; -u NAME
LOAD_D 2
CMP_A_D
JNZ env_assignment_or_exec
LOAD_B env_arg_ptr
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ env_assignment_or_exec
INC_B
LOAD8_A_B
LOAD_D 117
CMP_A_D
JNZ env_assignment_or_exec
LOAD_A 2
CALL env_arg
JZ env_usage
MOV_D_A
LOAD_C env_empty
CALL libc_setenv
LOAD_A 3
JMP env_maybe_exec

env_assignment_or_exec:
LOAD_A 1
LOAD_B env_index
STORE32_A_B
env_assignment_loop:
LOAD_B env_index
LOAD32_A_B
CALL env_arg
JZ env_success
PUSH_A
MOV_A_B
LOAD_B env_arg_ptr
STORE32_A_B
POP_A
LOAD_B env_arg_len
STORE32_A_B
CALL env_has_equals
JZ env_exec_current
LOAD_B env_arg_len
LOAD32_A_B
MOV_D_A
LOAD_B env_arg_ptr
LOAD32_A_B
MOV_B_A
LOAD_C env_empty
CALL libc_setenv
LOAD_B env_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP env_assignment_loop

env_exec_current:
LOAD_B env_index
LOAD32_A_B
env_maybe_exec:
LOAD_B env_index
STORE32_A_B
CALL env_arg
JZ env_success
; Preserve command pointer/length and complete remaining ARGS substring.
PUSH_A
MOV_A_B
LOAD_B env_command_ptr
STORE32_A_B
POP_A
LOAD_B env_command_len
STORE32_A_B
LOAD_B env_args_bytes
LOAD32_A_B
LOAD_B env_args
ADD_A_B
PUSH_A
LOAD_B env_command_ptr
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B env_remaining_len
STORE32_A_B
LOAD_B env_remaining_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B env_args_key
PUSH_A
LOAD_B env_command_ptr
LOAD32_A_B
MOV_C_A
POP_A
LOAD_B env_args_key
CALL libc_setenv
; /bin/command
LOAD_B env_bin_prefix
LOAD_C env_exec_path
LOAD_D 5
MEM_COPY
LOAD_B env_command_len
LOAD32_A_B
MOV_D_A
LOAD_B env_command_ptr
LOAD32_A_B
PUSH_A
LOAD_B env_exec_path
LOAD_D 5
ADD_B_D
MOV_C_B
POP_A
MOV_B_A
LOAD_B env_command_len
LOAD32_A_B
MOV_D_A
LOAD_B env_command_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
LOAD_B env_command_len
LOAD32_A_B
LOAD_B 5
ADD_A_B
MOV_C_A
LOAD_B env_exec_path
LOAD_D 0
CALL libc_spawn
LOAD_D -1
CMP_A_D
JZ env_error
MOV_B_A
LOAD_C env_status
CALL libc_wait
LOAD_B env_status
LOAD32_A_B
RET

env_list:
LOAD_B env_list_buffer
LOAD_C 1024
SYSCALL 0x36
LOAD_D -1
CMP_A_D
JZ env_error
MOV_C_A
LOAD_B env_list_buffer
CALL libc_puts
LOAD_B env_newline
LOAD_C 1
CALL libc_puts
env_success:
LOAD_A 0
RET
env_usage:
LOAD_B env_usage_text
LOAD_C 30
CALL libc_puts
LOAD_A 2
RET
env_error:
LOAD_B env_error_text
LOAD_C 10
CALL libc_puts
LOAD_A 1
RET

env_has_equals:
LOAD_A 0
LOAD_B env_scan
STORE32_A_B
env_equals_loop:
LOAD_B env_scan
LOAD32_A_B
MOV_D_A
LOAD_B env_arg_len
LOAD32_A_B
CMP_A_D
JZ env_equals_no
LOAD_B env_arg_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 61
CMP_A_D
JZ env_equals_yes
LOAD_B env_scan
LOAD32_A_B
INC_A
STORE32_A_B
JMP env_equals_loop
env_equals_yes:
LOAD_A 1
RET
env_equals_no:
LOAD_A 0
RET

; Return ARGS token A=index as B=pointer, A=bytes. Double quotes are stripped.
env_arg:
LOAD_B env_wanted
STORE32_A_B
LOAD_B env_args_key
LOAD_C env_args
LOAD_D 0x04000004
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JZ env_arg_missing
LOAD_B env_args_bytes
STORE32_A_B
LOAD_B env_args
PUSH_A
MOV_A_B
POP_A
ADD_A_B
LOAD_B env_end
STORE32_A_B
LOAD_A env_args
LOAD_B env_cursor
STORE32_A_B
LOAD_A 0
LOAD_B env_current
STORE32_A_B
env_arg_loop:
LOAD_B env_end
LOAD32_A_B
MOV_C_A
LOAD_B env_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ env_arg_missing
PUSH_A
MOV_A_B
LOAD_B env_token_ptr
STORE32_A_B
POP_A
LOAD_B env_token_len
STORE32_A_B
MOV_A_D
LOAD_B env_cursor
STORE32_A_B
LOAD_B env_current
LOAD32_A_B
MOV_D_A
LOAD_B env_wanted
LOAD32_A_B
CMP_A_D
JZ env_arg_found
LOAD_B env_current
LOAD32_A_B
INC_A
STORE32_A_B
JMP env_arg_loop
env_arg_found:
LOAD_B env_token_len
LOAD32_A_B
PUSH_A
LOAD_B env_token_ptr
LOAD32_A_B
MOV_B_A
POP_A
PUSH_A
LOAD8_A_B
LOAD_D 34
CMP_A_D
JNZ env_arg_plain
INC_B
MOV_C_B
POP_A
LOAD_B 2
SUB_A_B
MOV_B_C
RET
env_arg_plain:
POP_A
RET
env_arg_missing:
LOAD_A 0
RET

.org 23000
env_wanted: .dword 0
env_current: .dword 0
env_cursor: .dword 0
env_end: .dword 0
env_token_ptr: .dword 0
env_token_len: .dword 0
env_args_bytes: .dword 0
env_arg_ptr: .dword 0
env_arg_len: .dword 0
env_index: .dword 0
env_scan: .dword 0
env_command_ptr: .dword 0
env_command_len: .dword 0
env_remaining_len: .dword 0
env_status: .dword 0
env_args: .zero 1024
env_list_buffer: .zero 1024
env_exec_path: .zero 256
env_args_key: .string "ARGS"
env_bin_prefix: .string "/bin/"
env_empty: .byte 0
env_newline: .string "\n"
env_usage_text: .string "usage: env [-u NAME] [NAME=VALUE] [command]\n"
env_error_text: .string "env error\n"
