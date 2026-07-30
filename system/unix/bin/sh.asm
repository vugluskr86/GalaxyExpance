.protected
.export main
.import libc_puts
.import libc_spawn
.import libc_spawn_fds
.import libc_wait
.import libc_open
.import libc_close
.import libc_unlink
.import libc_format_int
.import libc_chdir
.import libc_getcwd
.import libc_setenv
.import shell_parse_line
.import shell_next_segment
.import shell_segment_pipe

main:
LOAD_B shell_path_key
LOAD_C shell_default_path
LOAD_D 0x00090004
CALL libc_setenv
LOAD_B shell_batch_key
LOAD_C shell_raw_line
LOAD_D 0x0800000a
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JZ shell_loop
LOAD_B shell_raw_bytes
STORE32_A_B
LOAD_A 1
LOAD_B shell_batch
STORE32_A_B
JMP shell_not_interrupt
shell_loop:
CALL shell_print_prompt
LOAD_B shell_raw_line
LOAD_C 2048
SYSCALL 0x40
JZ shell_loop
LOAD_D -1
CMP_A_D
JZ shell_exit_ok
LOAD_B shell_raw_bytes
STORE32_A_B
LOAD_B shell_raw_line
LOAD8_A_B
LOAD_D 3
CMP_A_D
JNZ shell_not_interrupt
LOAD_A 130
LOAD_B shell_last_status
STORE32_A_B
LOAD_B shell_interrupt_text
LOAD_C 2
CALL libc_puts
JMP shell_loop
shell_not_interrupt:
LOAD_A 0
LOAD_B shell_segment_offset
STORE32_A_B
LOAD_B shell_pipe_input
STORE32_A_B
shell_segment_fetch:
LOAD_B shell_segment_offset
LOAD32_A_B
MOV_D_A
LOAD_B shell_raw_line
ADD_B_D
MOV_A_B
LOAD_B shell_segment_ptr
STORE32_A_B
LOAD_B shell_raw_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_raw_line
CALL shell_next_segment
PUSH_A
MOV_A_D
LOAD_B shell_segment_offset
STORE32_A_B
POP_A
JZ shell_segment_continue
PUSH_A
LOAD_B shell_segment_pipe
LOAD32_A_B
LOAD_B shell_pipe_output
STORE32_A_B
POP_A
LOAD_B shell_line_bytes
STORE32_A_B
MOV_D_A
LOAD_C shell_line
LOAD_B shell_segment_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
CALL shell_expand_status
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
CALL shell_parse_line
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
LOAD_D 0
STR_TOKEN
JZ shell_segment_continue
PUSH_A
MOV_A_B
LOAD_B shell_command_ptr
STORE32_A_B
POP_A
LOAD_B shell_command
STORE32_A_B

CALL shell_is_exit
JNZ shell_exit_ok
CALL shell_is_help
JNZ shell_help
CALL shell_is_pwd
JNZ shell_pwd
CALL shell_is_cd
JNZ shell_cd
CALL shell_is_export
JNZ shell_export
CALL shell_is_unset
JNZ shell_unset
JMP shell_external

shell_help:
LOAD_B shell_help_text
LOAD_C 57
CALL libc_puts
JMP shell_segment_continue
shell_pwd:
LOAD_B shell_path
LOAD_C 256
CALL libc_getcwd
MOV_C_A
LOAD_B shell_path
CALL libc_puts
LOAD_B shell_newline
LOAD_C 1
CALL libc_puts
JMP shell_segment_continue
shell_cd:
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
LOAD_D 1
STR_TOKEN
JZ shell_usage
MOV_C_A
CALL libc_chdir
LOAD_D 0
CMP_A_D
JNZ shell_error
JMP shell_segment_continue
shell_export:
; export NAME=VALUE: split at '=' inside the second bounded token.
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
LOAD_D 1
STR_TOKEN
JZ shell_usage
CALL shell_export_token
JMP shell_segment_continue
shell_unset:
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
LOAD_D 1
STR_TOKEN
JZ shell_usage
; ENV_SET with an empty value implements unset for the bounded PCOS env map.
MOV_D_A
LOAD_C shell_empty
CALL libc_setenv
JMP shell_segment_continue

shell_external:
CALL shell_prepare_redirect
LOAD_D -1
CMP_A_D
JZ shell_error
CALL shell_prepare_pipe_fds
LOAD_D -1
CMP_A_D
JZ shell_error
LOAD_B shell_spawn_fd_spec
STORE32_A_B
; Preserve the complete command line for the child's argc/argv bootstrap.
LOAD_B shell_line_bytes
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B shell_args_key
LOAD_C shell_line
CALL libc_setenv
; PATH lookup currently uses the canonical installed /bin directory.
LOAD_B shell_exec_path
MOV_C_B
LOAD_B shell_bin_prefix
LOAD_D 5
MEM_COPY
LOAD_B shell_command_ptr
LOAD32_A_B
MOV_B_A
LOAD_B shell_exec_path
MOV_A_B
LOAD_B 5
ADD_A_B
MOV_C_A
LOAD_B shell_command
LOAD32_A_B
MOV_D_A
LOAD_B shell_command_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
LOAD_B shell_command
LOAD32_A_B
LOAD_B 5
ADD_A_B
MOV_C_A
LOAD_B shell_exec_path
LOAD_B shell_spawn_fd_spec
LOAD32_A_B
MOV_D_A
JZ shell_spawn_plain
LOAD_B shell_exec_path
CALL libc_spawn_fds
JMP shell_spawn_done
shell_spawn_plain:
LOAD_B shell_exec_path
LOAD_D 0
CALL libc_spawn
shell_spawn_done:
LOAD_D -1
CMP_A_D
JZ shell_error
MOV_B_A
LOAD_C shell_status
shell_wait_child:
CALL libc_wait
LOAD_D -1
CMP_A_D
JNZ shell_wait_done
; A child is still running. Yield instead of returning a prompt and leaving
; one-shot commands such as cat/find as apparent background processes.
SYSCALL 2
JMP shell_wait_child
shell_wait_done:
LOAD_B shell_status
LOAD32_A_B
LOAD_B shell_last_status
STORE32_A_B
LOAD_B shell_redirect_fd
LOAD32_A_B
LOAD_D -1
CMP_A_D
JZ shell_close_after_redirect
MOV_B_A
CALL libc_close
shell_close_after_redirect:
CALL shell_close_pipe_fds
JMP shell_segment_continue

shell_error:
CALL shell_close_pipe_fds
LOAD_B shell_error_text
LOAD_C 15
CALL libc_puts
JMP shell_segment_continue
shell_usage:
LOAD_B shell_usage_text
LOAD_C 13
CALL libc_puts
JMP shell_segment_continue
shell_segment_continue:
LOAD_B shell_pipe_input
LOAD32_A_B
JZ shell_segment_pipe_state
LOAD_B shell_pipe_output
LOAD32_A_B
JNZ shell_segment_pipe_state
LOAD_B shell_pipe_path
LOAD_C 10
CALL libc_unlink
shell_segment_pipe_state:
LOAD_B shell_pipe_output
LOAD32_A_B
LOAD_B shell_pipe_input
STORE32_A_B
LOAD_B shell_segment_offset
LOAD32_A_B
LOAD_D -1
CMP_A_D
JNZ shell_segment_fetch
LOAD_B shell_batch
LOAD32_A_B
JZ shell_loop
LOAD_B shell_last_status
LOAD32_A_B
RET
shell_exit_ok:
LOAD_A 0
RET

shell_is_exit:
LOAD_C cmd_exit
LOAD_D 4
JMP shell_match
shell_is_help:
LOAD_C cmd_help
LOAD_D 4
JMP shell_match
shell_is_pwd:
LOAD_C cmd_pwd
LOAD_D 3
JMP shell_match
shell_is_cd:
LOAD_C cmd_cd
LOAD_D 2
JMP shell_match
shell_is_export:
LOAD_C cmd_export
LOAD_D 6
JMP shell_match
shell_is_unset:
LOAD_C cmd_unset
LOAD_D 5
shell_match:
LOAD_B shell_command
LOAD32_A_B
CMP_A_D
JNZ shell_match_no
LOAD_B shell_command_ptr
LOAD32_A_B
MOV_B_A
MEM_CMP
JNZ shell_match_no
LOAD_A 1
RET
shell_match_no:
LOAD_A 0
RET

shell_export_token:
; B=NAME=VALUE token, A=length. The parser node is retained in the shell
; buffer; the bounded environment syscall validates names.
MOV_D_A
LOAD_C shell_empty
CALL libc_setenv
LOAD_A 1
RET

shell_print_prompt:
LOAD_B shell_user_key
LOAD_C shell_prompt_user
LOAD_D 0x00200004
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JNZ shell_prompt_have_user
LOAD_B shell_default_user
LOAD_C 4
CALL libc_puts
JMP shell_prompt_host
shell_prompt_have_user:
MOV_C_A
LOAD_B shell_prompt_user
CALL libc_puts
shell_prompt_host:
LOAD_B shell_host_text
LOAD_C 6
CALL libc_puts
LOAD_B shell_path
LOAD_C 256
CALL libc_getcwd
MOV_C_A
LOAD_B shell_path
CALL libc_puts
LOAD_B shell_prompt_tail
LOAD_C 2
CALL libc_puts
RET

; Expand the required special parameter $? into the previous command status.
; The transform uses a separate bounded buffer, so source and destination may
; have different lengths without overlap corruption.
shell_expand_status:
LOAD_A 0
LOAD_B shell_expand_src
STORE32_A_B
LOAD_B shell_expand_dst
STORE32_A_B
shell_expand_loop:
LOAD_B shell_expand_src
LOAD32_A_B
MOV_D_A
LOAD_B shell_line_bytes
LOAD32_A_B
CMP_A_D
JZ shell_expand_done
LOAD_B shell_line
ADD_B_D
LOAD8_A_B
LOAD_D 36
CMP_A_D
JNZ shell_expand_copy
LOAD_B shell_expand_src
LOAD32_A_B
INC_A
MOV_D_A
LOAD_B shell_line_bytes
LOAD32_A_B
CMP_A_D
JZ shell_expand_copy
LOAD_B shell_line
ADD_B_D
LOAD8_A_B
LOAD_D 63
CMP_A_D
JZ shell_expand_status_value
LOAD_D 36
CMP_A_D
JNZ shell_expand_variable
SYSCALL 5
JMP shell_expand_number
shell_expand_status_value:
LOAD_B shell_last_status
LOAD32_A_B
shell_expand_number:
MOV_B_A
LOAD_C shell_status_text
LOAD_D 16
CALL libc_format_int
LOAD_B shell_expand_status_len
STORE32_A_B
LOAD_B shell_expand_dst
LOAD32_A_B
MOV_D_A
LOAD_B shell_expanded_line
ADD_B_D
MOV_C_B
LOAD_B shell_status_text
LOAD_B shell_expand_status_len
LOAD32_A_B
MOV_D_A
LOAD_B shell_status_text
MEM_COPY
LOAD_B shell_expand_dst
LOAD32_A_B
PUSH_A
LOAD_B shell_expand_status_len
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
LOAD_B shell_expand_dst
STORE32_A_B
LOAD_B shell_expand_src
LOAD32_A_B
LOAD_B 2
ADD_A_B
LOAD_B shell_expand_src
STORE32_A_B
JMP shell_expand_loop
shell_expand_variable:
; Scan a bounded NAME and fetch it through the environment syscall.
LOAD_B shell_expand_src
LOAD32_A_B
INC_A
LOAD_B shell_expand_var_start
STORE32_A_B
LOAD_B shell_expand_var_end
STORE32_A_B
shell_expand_var_scan:
LOAD_B shell_expand_var_end
LOAD32_A_B
MOV_D_A
LOAD_B shell_line_bytes
LOAD32_A_B
CMP_A_D
JZ shell_expand_var_fetch
LOAD_B shell_line
ADD_B_D
LOAD8_A_B
LOAD_D 32
CMP_A_D
JZ shell_expand_var_fetch
LOAD_D 34
CMP_A_D
JZ shell_expand_var_fetch
LOAD_D 47
CMP_A_D
JZ shell_expand_var_fetch
LOAD_D 59
CMP_A_D
JZ shell_expand_var_fetch
LOAD_D 124
CMP_A_D
JZ shell_expand_var_fetch
LOAD_D 60
CMP_A_D
JZ shell_expand_var_fetch
LOAD_D 62
CMP_A_D
JZ shell_expand_var_fetch
LOAD_B shell_expand_var_end
LOAD32_A_B
INC_A
STORE32_A_B
JMP shell_expand_var_scan
shell_expand_var_fetch:
LOAD_B shell_expand_var_end
LOAD32_A_B
PUSH_A
LOAD_B shell_expand_var_start
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B shell_expand_var_len
STORE32_A_B
JZ shell_expand_copy
LOAD_B shell_expand_var_start
LOAD32_A_B
MOV_D_A
LOAD_B shell_line
ADD_B_D
LOAD_C shell_env_text
LOAD_B shell_expand_var_len
LOAD32_A_B
LOAD_B 16777216
ADD_A_B
LOAD_B shell_expand_var_spec
STORE32_A_B
LOAD_B shell_expand_var_start
LOAD32_A_B
MOV_D_A
LOAD_B shell_line
ADD_B_D
LOAD_C shell_env_text
LOAD_B shell_expand_var_spec
LOAD32_A_B
MOV_D_A
PUSH_A
LOAD_B shell_expand_var_start
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
ADD_B_C
POP_A
MOV_D_A
LOAD_C shell_env_text
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JZ shell_expand_var_empty
LOAD_B shell_expand_var_value_len
STORE32_A_B
LOAD_B shell_expand_dst
LOAD32_A_B
MOV_D_A
LOAD_B shell_expanded_line
ADD_B_D
MOV_C_B
LOAD_B shell_expand_var_value_len
LOAD32_A_B
MOV_D_A
LOAD_B shell_env_text
MEM_COPY
LOAD_B shell_expand_dst
LOAD32_A_B
PUSH_A
LOAD_B shell_expand_var_value_len
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
LOAD_B shell_expand_dst
STORE32_A_B
shell_expand_var_empty:
LOAD_B shell_expand_var_end
LOAD32_A_B
LOAD_B shell_expand_src
STORE32_A_B
JMP shell_expand_loop
shell_expand_copy:
; reload source byte (comparisons above may have advanced the temporary D)
LOAD_B shell_expand_src
LOAD32_A_B
MOV_D_A
LOAD_B shell_line
ADD_B_D
LOAD8_A_B
PUSH_A
LOAD_B shell_expand_dst
LOAD32_A_B
MOV_D_A
LOAD_B shell_expanded_line
ADD_B_D
POP_A
STORE8_A_B
LOAD_B shell_expand_src
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B shell_expand_dst
LOAD32_A_B
INC_A
STORE32_A_B
JMP shell_expand_loop
shell_expand_done:
LOAD_B shell_expand_dst
LOAD32_A_B
MOV_D_A
LOAD_B shell_expanded_line
LOAD_C shell_line
MEM_COPY
LOAD_B shell_expand_dst
LOAD32_A_B
LOAD_B shell_line_bytes
STORE32_A_B
RET

; Parse a single whitespace-delimited <, > or >> node. The opened descriptor
; is passed atomically to SPAWN_FD, so the parent shell descriptors never
; need to be modified/restored.
shell_prepare_redirect:
LOAD_A -1
LOAD_B shell_redirect_fd
STORE32_A_B
LOAD_A 0
LOAD_B shell_redirect_index
STORE32_A_B
shell_redirect_scan:
LOAD_B shell_redirect_index
LOAD32_A_B
INC_A
STORE32_A_B
MOV_D_A
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
STR_TOKEN
JZ shell_redirect_none
PUSH_A
MOV_A_B
LOAD_B shell_redirect_token_ptr
STORE32_A_B
POP_A
LOAD_D 1
CMP_A_D
JZ shell_redirect_one
LOAD_D 2
CMP_A_D
JNZ shell_redirect_scan
LOAD_B shell_redirect_token_ptr
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 62
CMP_A_D
JNZ shell_redirect_scan
INC_B
LOAD8_A_B
LOAD_D 62
CMP_A_D
JNZ shell_redirect_scan
LOAD_A 21
LOAD_B shell_redirect_flags
STORE32_A_B
LOAD_A 256
LOAD_B shell_redirect_spec
STORE32_A_B
JMP shell_redirect_open_target
shell_redirect_one:
LOAD_B shell_redirect_token_ptr
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 62
CMP_A_D
JZ shell_redirect_output
LOAD_D 60
CMP_A_D
JNZ shell_redirect_scan
LOAD_A 0
LOAD_B shell_redirect_flags
STORE32_A_B
LOAD_A 1
LOAD_B shell_redirect_spec
STORE32_A_B
JMP shell_redirect_open_target
shell_redirect_output:
LOAD_A 13
LOAD_B shell_redirect_flags
STORE32_A_B
LOAD_A 256
LOAD_B shell_redirect_spec
STORE32_A_B
shell_redirect_open_target:
LOAD_B shell_redirect_index
LOAD32_A_B
INC_A
MOV_D_A
LOAD_B shell_line_bytes
LOAD32_A_B
MOV_C_A
LOAD_B shell_line
STR_TOKEN
JZ shell_redirect_error
MOV_C_A
MOV_A_B
LOAD_B shell_redirect_target_ptr
STORE32_A_B
LOAD_B shell_redirect_flags
LOAD32_A_B
MOV_D_A
LOAD_B shell_redirect_target_ptr
LOAD32_A_B
MOV_B_A
CALL libc_open
LOAD_D -1
CMP_A_D
JZ shell_redirect_error
LOAD_B shell_redirect_fd
STORE32_A_B
INC_A
LOAD_B shell_redirect_encoded
STORE32_A_B
LOAD_B shell_redirect_spec
LOAD32_A_B
PUSH_A
LOAD_B shell_redirect_encoded
LOAD32_A_B
MOV_B_A
POP_A
MUL_A_B
RET
shell_redirect_none:
LOAD_A 0
RET
shell_redirect_error:
LOAD_A -1
RET

; Add pipeline stdin/stdout descriptors to an existing SPAWN_FD spec.
; Commands are waited sequentially; the bounded spool file gives deterministic
; pipe semantics without consuming another emulated CPU thread.
shell_prepare_pipe_fds:
LOAD_B shell_pipe_spec
STORE32_A_B
LOAD_A -1
LOAD_B shell_pipe_in_fd
STORE32_A_B
LOAD_B shell_pipe_out_fd
STORE32_A_B
LOAD_B shell_pipe_input
LOAD32_A_B
JZ shell_pipe_prepare_output
LOAD_B shell_pipe_path
LOAD_C 10
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ shell_pipe_prepare_error
LOAD_B shell_pipe_in_fd
STORE32_A_B
INC_A
PUSH_A
LOAD_B shell_pipe_spec
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
LOAD_B shell_pipe_spec
STORE32_A_B
shell_pipe_prepare_output:
LOAD_B shell_pipe_output
LOAD32_A_B
JZ shell_pipe_prepare_done
LOAD_B shell_pipe_path
LOAD_C 10
LOAD_D 13
CALL libc_open
LOAD_D -1
CMP_A_D
JZ shell_pipe_prepare_error
LOAD_B shell_pipe_out_fd
STORE32_A_B
INC_A
LOAD_B 256
MUL_A_B
PUSH_A
LOAD_B shell_pipe_spec
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
LOAD_B shell_pipe_spec
STORE32_A_B
shell_pipe_prepare_done:
LOAD_B shell_pipe_spec
LOAD32_A_B
RET
shell_pipe_prepare_error:
CALL shell_close_pipe_fds
LOAD_A -1
RET
shell_close_pipe_fds:
LOAD_B shell_pipe_in_fd
LOAD32_A_B
LOAD_D -1
CMP_A_D
JZ shell_close_pipe_out
MOV_B_A
CALL libc_close
shell_close_pipe_out:
LOAD_B shell_pipe_out_fd
LOAD32_A_B
LOAD_D -1
CMP_A_D
JZ shell_close_pipe_done
MOV_B_A
CALL libc_close
shell_close_pipe_done:
RET

.org 15000
shell_line_bytes: .dword 0
shell_command: .dword 0
shell_command_ptr: .dword 0
shell_status: .dword 0
shell_last_status: .dword 0
shell_raw_bytes: .dword 0
shell_batch: .dword 0
shell_segment_offset: .dword 0
shell_segment_ptr: .dword 0
shell_spawn_fd_spec: .dword 0
shell_redirect_fd: .dword -1
shell_redirect_index: .dword 0
shell_redirect_token_ptr: .dword 0
shell_redirect_flags: .dword 0
shell_redirect_spec: .dword 0
shell_redirect_encoded: .dword 0
shell_redirect_target_ptr: .dword 0
shell_pipe_input: .dword 0
shell_pipe_output: .dword 0
shell_pipe_spec: .dword 0
shell_pipe_in_fd: .dword -1
shell_pipe_out_fd: .dword -1
shell_expand_src: .dword 0
shell_expand_dst: .dword 0
shell_expand_status_len: .dword 0
shell_expand_var_start: .dword 0
shell_expand_var_end: .dword 0
shell_expand_var_len: .dword 0
shell_expand_var_value_len: .dword 0
shell_expand_var_spec: .dword 0
shell_export_ptr: .dword 0
shell_export_len: .dword 0
shell_scan: .dword 0
shell_line: .zero 2048
shell_raw_line: .zero 2048
shell_expanded_line: .zero 2048
shell_status_text: .zero 16
shell_env_text: .zero 256
shell_prompt_user: .zero 32
shell_path: .zero 256
shell_exec_path: .zero 256
shell_prompt_tail: .string "$ "
shell_host_text: .string "@pcos:"
shell_user_key: .string "USER"
shell_default_user: .string "user"
shell_pipe_path: .string ".pcos-pipe"
shell_batch_key: .string "SH_COMMAND"
shell_newline: .string "\n"
shell_help_text: .string "builtins cd pwd export unset exit help commands use /bin\n"
shell_error_text: .string "command failed\n"
shell_usage_text: .string "bad arguments\n"
shell_interrupt_text: .string "^C"
shell_bin_prefix: .string "/bin/"
shell_args_key: .string "ARGS"
shell_path_key: .string "PATH"
shell_default_path: .string "/bin:/sbin"
shell_empty: .byte 0
cmd_exit: .string "exit"
cmd_help: .string "help"
cmd_pwd: .string "pwd"
cmd_cd: .string "cd"
cmd_export: .string "export"
cmd_unset: .string "unset"
