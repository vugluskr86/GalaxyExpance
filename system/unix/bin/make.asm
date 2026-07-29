.protected
.export main
.import libc_puts
.import libc_open
.import libc_read
.import libc_close
.import libc_stat
.import libc_spawn
.import libc_wait
.import libc_setenv

main:
LOAD_A make_default_file
LOAD_B make_file_ptr
STORE32_A_B
CALL make_parse_args
JNZ make_usage
CALL make_cycle_enter
JNZ make_cycle
CALL make_read_file
JNZ make_error
CALL make_join_continuations
CALL make_load_variables
CALL make_find_rule
JNZ make_no_rule
CALL make_needs_rebuild
LOAD_D -1
CMP_A_D
JZ make_error
JZ make_success
CALL make_expand_recipe
LOAD_B make_dry_run
LOAD32_A_B
JZ make_execute_recipe
LOAD_B make_recipe_out
LOAD_B make_recipe_out_len
LOAD32_A_B
MOV_C_A
LOAD_B make_recipe_out
CALL libc_puts
LOAD_B make_newline
LOAD_C 1
CALL libc_puts
JMP make_success

make_execute_recipe:
; SH_COMMAND is consumed by the real Assembly shell batch entry.
LOAD_B make_recipe_out_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 10
ADD_A_B
MOV_D_A
LOAD_B make_shell_command_key
LOAD_C make_recipe_out
CALL libc_setenv
LOAD_B make_args_key
LOAD_C make_shell_arg
LOAD_D 0x00020004
CALL libc_setenv
LOAD_B make_shell_path
LOAD_C 11
LOAD_D 0
CALL libc_spawn
LOAD_D -1
CMP_A_D
JZ make_error
MOV_B_A
LOAD_C make_status
CALL libc_wait
; Always remove the batch command from the inherited environment.
LOAD_B make_shell_command_key
LOAD_C make_empty
LOAD_D 10
CALL libc_setenv
LOAD_B make_status
LOAD32_A_B
RET

make_success:
LOAD_A 0
RET
make_usage:
LOAD_B make_usage_text
LOAD_C 37
CALL libc_puts
LOAD_A 2
RET
make_no_rule:
LOAD_B make_no_rule_text
LOAD_C 14
CALL libc_puts
LOAD_B make_requested_ptr
LOAD32_A_B
MOV_B_A
LOAD_B make_requested_len
LOAD32_A_B
MOV_C_A
LOAD_B make_requested_ptr
LOAD32_A_B
MOV_B_A
CALL libc_puts
LOAD_B make_newline
LOAD_C 1
CALL libc_puts
LOAD_A 1
RET
make_cycle:
LOAD_B make_cycle_text
LOAD_C 17
CALL libc_puts
LOAD_A 1
RET
make_error:
LOAD_B make_error_text
LOAD_C 11
CALL libc_puts
LOAD_A 1
RET

; ARGS: make [-n] [-f file] [target].
make_parse_args:
LOAD_B make_args_key
LOAD_C make_args
LOAD_D 0x08000004
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JZ make_args_default
LOAD_B make_args_len
STORE32_A_B
LOAD_A 1
LOAD_B make_arg_index
STORE32_A_B
make_arg_loop:
LOAD_B make_arg_index
LOAD32_A_B
CALL make_arg
JZ make_args_done
LOAD_D 2
CMP_A_D
JNZ make_arg_target
PUSH_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ make_arg_target_pop
INC_B
LOAD8_A_B
LOAD_D 110
CMP_A_D
JZ make_arg_dry
LOAD_D 102
CMP_A_D
JZ make_arg_file
make_arg_target_pop:
POP_A
make_arg_target:
PUSH_A
MOV_A_B
LOAD_B make_requested_ptr
STORE32_A_B
POP_A
LOAD_B make_requested_len
STORE32_A_B
JMP make_arg_next
make_arg_dry:
POP_A
LOAD_A 1
LOAD_B make_dry_run
STORE32_A_B
JMP make_arg_next
make_arg_file:
POP_A
LOAD_B make_arg_index
LOAD32_A_B
INC_A
STORE32_A_B
CALL make_arg
JZ make_args_bad
PUSH_A
MOV_A_B
LOAD_B make_file_ptr
STORE32_A_B
POP_A
LOAD_B make_file_len
STORE32_A_B
make_arg_next:
LOAD_B make_arg_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_arg_loop
make_args_done:
LOAD_A 0
RET
make_args_default:
LOAD_A 0
LOAD_B make_args_len
STORE32_A_B
RET
make_args_bad:
LOAD_A 1
RET

make_read_file:
LOAD_B make_file_len
LOAD32_A_B
MOV_C_A
LOAD_B make_file_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ make_read_error
LOAD_B make_fd
STORE32_A_B
LOAD_A 0
LOAD_B make_file_bytes
STORE32_A_B
make_read_loop:
LOAD_B make_fd
LOAD32_A_B
MOV_B_A
LOAD_B make_file_bytes
LOAD32_A_B
MOV_D_A
LOAD_B make_file
ADD_B_D
MOV_C_B
LOAD_B make_file_bytes
LOAD32_A_B
MOV_B_A
LOAD_A 16384
SUB_A_B
MOV_D_A
LOAD_B make_fd
LOAD32_A_B
MOV_B_A
CALL libc_read
JZ make_read_done
LOAD_D -1
CMP_A_D
JZ make_read_error_close
MOV_D_A
LOAD_B make_file_bytes
LOAD32_A_B
MOV_B_D
ADD_A_B
LOAD_B make_file_bytes
STORE32_A_B
JMP make_read_loop
make_read_done:
LOAD_B make_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_A 0
RET
make_read_error_close:
LOAD_B make_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
make_read_error:
LOAD_A 1
RET

; Backslash-newline becomes two spaces, preserving all later offsets.
make_join_continuations:
LOAD_A 0
LOAD_B make_scan
STORE32_A_B
make_join_loop:
LOAD_B make_scan
LOAD32_A_B
MOV_D_A
LOAD_B make_file_bytes
LOAD32_A_B
CMP_A_D
JZ make_join_done
LOAD_B make_file
ADD_B_D
LOAD8_A_B
LOAD_D 92
CMP_A_D
JNZ make_join_next
LOAD_B make_scan
LOAD32_A_B
INC_A
MOV_D_A
LOAD_B make_file_bytes
LOAD32_A_B
CMP_A_D
JZ make_join_next
LOAD_B make_file
ADD_B_D
LOAD8_A_B
LOAD_D 10
CMP_A_D
JNZ make_join_next
LOAD_A 32
STORE8_A_B
DEC_B
STORE8_A_B
make_join_next:
LOAD_B make_scan
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_join_loop
make_join_done:
RET

; Import NAME=value assignments into the process environment.
make_load_variables:
LOAD_A 0
LOAD_B make_line_start
STORE32_A_B
make_var_line:
CALL make_next_line
JZ make_var_done
LOAD_B make_line_len
LOAD32_A_B
JZ make_var_advance
LOAD_B make_line_ptr
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 9
CMP_A_D
JZ make_var_advance
LOAD_D 35
CMP_A_D
JZ make_var_advance
CALL make_line_kind
LOAD_D 1
CMP_A_D
JNZ make_var_advance
LOAD_B make_line_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_line_len
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
LOAD_C make_empty
CALL libc_setenv
make_var_advance:
CALL make_advance_line
JMP make_var_line
make_var_done:
RET

; Locate requested/default rule. line_kind: A=2 for target:deps.
make_find_rule:
LOAD_A 0
LOAD_B make_line_start
STORE32_A_B
make_rule_line:
CALL make_next_line
JZ make_rule_missing
CALL make_line_kind
LOAD_D 2
CMP_A_D
JNZ make_rule_advance
LOAD_B make_mark
LOAD32_A_B
PUSH_A
LOAD_B make_line_ptr
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B make_candidate_len
STORE32_A_B
LOAD_B make_requested_len
LOAD32_A_B
JZ make_rule_select
MOV_D_A
LOAD_B make_candidate_len
LOAD32_A_B
CMP_A_D
JNZ make_rule_advance
LOAD_B make_line_ptr
LOAD32_A_B
MOV_B_A
LOAD_B make_requested_ptr
LOAD32_A_B
MOV_C_A
LOAD_B make_candidate_len
LOAD32_A_B
MOV_D_A
LOAD_B make_line_ptr
LOAD32_A_B
MOV_B_A
MEM_CMP
JNZ make_rule_advance
make_rule_select:
LOAD_B make_line_ptr
LOAD32_A_B
LOAD_B make_target_ptr
STORE32_A_B
LOAD_B make_candidate_len
LOAD32_A_B
LOAD_B make_target_len
STORE32_A_B
LOAD_B make_mark
LOAD32_A_B
INC_A
LOAD_B make_deps_ptr
STORE32_A_B
LOAD_B make_line_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_line_len
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
PUSH_A
LOAD_B make_deps_ptr
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B make_deps_len
STORE32_A_B
; Recipe is the next physical line and must begin with TAB.
CALL make_advance_line
CALL make_next_line
JZ make_rule_without_recipe
LOAD_B make_line_ptr
LOAD32_A_B
MOV_B_A
LOAD8_A_B
LOAD_D 9
CMP_A_D
JNZ make_rule_without_recipe
LOAD_B make_line_ptr
LOAD32_A_B
INC_A
LOAD_B make_recipe_ptr
STORE32_A_B
LOAD_B make_line_len
LOAD32_A_B
DEC_A
LOAD_B make_recipe_len
STORE32_A_B
LOAD_A 0
RET
make_rule_without_recipe:
LOAD_A 0
LOAD_B make_recipe_len
STORE32_A_B
RET
make_rule_advance:
CALL make_advance_line
JMP make_rule_line
make_rule_missing:
LOAD_A 1
RET

; Rebuild if target is absent or a dependency is absent/newer.
make_needs_rebuild:
LOAD_A 0
LOAD_B make_rebuild
STORE32_A_B
LOAD_B make_target_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_target_len
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
LOAD_D make_target_stat
CALL libc_stat
LOAD_D -1
CMP_A_D
JNZ make_target_exists
LOAD_A 1
LOAD_B make_rebuild
STORE32_A_B
make_target_exists:
LOAD_A 0
LOAD_B make_dep_index
STORE32_A_B
make_dep_loop:
LOAD_B make_dep_index
LOAD32_A_B
MOV_D_A
LOAD_B make_deps_len
LOAD32_A_B
MOV_C_A
LOAD_B make_deps_ptr
LOAD32_A_B
MOV_B_A
STR_TOKEN
JZ make_dep_done
MOV_C_A
MOV_A_B
LOAD_B make_dep_ptr
STORE32_A_B
MOV_A_C
LOAD_B make_dep_len
STORE32_A_B
; Self-dependency is the minimal cycle and is rejected deterministically.
LOAD_B make_target_len
LOAD32_A_B
MOV_D_A
LOAD_B make_dep_len
LOAD32_A_B
CMP_A_D
JNZ make_dep_stat
LOAD_B make_target_ptr
LOAD32_A_B
MOV_C_A
LOAD_B make_dep_len
LOAD32_A_B
MOV_D_A
LOAD_B make_dep_ptr
LOAD32_A_B
MOV_B_A
MEM_CMP
JZ make_cycle
make_dep_stat:
LOAD_B make_dep_len
LOAD32_A_B
MOV_C_A
LOAD_B make_dep_ptr
LOAD32_A_B
MOV_B_A
LOAD_D make_dep_stat_buf
CALL libc_stat
LOAD_D -1
CMP_A_D
JNZ make_dep_has_stat
; A missing dependency may itself be a Makefile target. Build it in a child
; make process so every process keeps a small, bounded parser state.
CALL make_build_dependency
JNZ make_dependency_failed
LOAD_A 1
LOAD_B make_rebuild
STORE32_A_B
JMP make_dep_next
make_dep_has_stat:
LOAD_B make_rebuild
LOAD32_A_B
JNZ make_dep_next
; diff = dep.mtime - target.mtime; positive signed values require rebuild.
LOAD_B make_dep_stat_buf
LOAD_D 28
ADD_B_D
LOAD32_A_B
PUSH_A
LOAD_B make_target_stat
LOAD_D 28
ADD_B_D
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
JZ make_dep_next
LOAD_B make_time_diff
STORE32_A_B
LOAD_B make_time_diff
LOAD_D 3
ADD_B_D
LOAD8_A_B
LOAD_B 128
AND_A_B
JNZ make_dep_next
LOAD_A 1
LOAD_B make_rebuild
STORE32_A_B
make_dep_next:
LOAD_B make_dep_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_dep_loop
make_dep_done:
LOAD_B make_recipe_len
LOAD32_A_B
JZ make_no_recipe_needed
LOAD_B make_rebuild
LOAD32_A_B
RET
make_no_recipe_needed:
LOAD_A 0
RET

make_dependency_failed:
LOAD_A -1
RET

; Maintain a whitespace-delimited target ancestry in MAKE_STACK.  Every child
; make gets a private inherited environment, so finding its requested target
; in the stack is a real graph cycle (A -> ... -> A), not merely a duplicate
; dependency in an unrelated branch.
make_cycle_enter:
LOAD_B make_stack_key
LOAD_C make_stack
LOAD_D 0x0800000a
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JNZ make_stack_loaded
LOAD_A 0
make_stack_loaded:
LOAD_B make_stack_len
STORE32_A_B
LOAD_A 0
LOAD_B make_stack_index
STORE32_A_B
make_stack_scan:
LOAD_B make_stack_index
LOAD32_A_B
MOV_D_A
LOAD_B make_stack_len
LOAD32_A_B
MOV_C_A
LOAD_B make_stack
STR_TOKEN
JZ make_stack_append
MOV_C_A
MOV_A_B
LOAD_B make_stack_token_ptr
STORE32_A_B
MOV_A_C
LOAD_B make_stack_token_len
STORE32_A_B
LOAD_B make_requested_len
LOAD32_A_B
MOV_D_A
LOAD_B make_stack_token_len
LOAD32_A_B
CMP_A_D
JNZ make_stack_next
LOAD_B make_requested_ptr
LOAD32_A_B
MOV_C_A
LOAD_B make_stack_token_len
LOAD32_A_B
MOV_D_A
LOAD_B make_stack_token_ptr
LOAD32_A_B
MOV_B_A
MEM_CMP
JZ make_stack_cycle
make_stack_next:
LOAD_B make_stack_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_stack_scan
make_stack_append:
LOAD_B make_stack_len
LOAD32_A_B
JZ make_stack_copy_target
MOV_D_A
LOAD_B make_stack
ADD_B_D
LOAD_A 32
STORE8_A_B
LOAD_B make_stack_len
LOAD32_A_B
INC_A
STORE32_A_B
make_stack_copy_target:
LOAD_B make_stack_len
LOAD32_A_B
MOV_D_A
LOAD_B make_stack
ADD_B_D
MOV_C_B
LOAD_B make_requested_len
LOAD32_A_B
MOV_D_A
LOAD_B make_requested_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
LOAD_B make_stack_len
LOAD32_A_B
MOV_D_A
LOAD_B make_requested_len
LOAD32_A_B
MOV_B_A
MOV_A_D
ADD_A_B
LOAD_B make_stack_len
STORE32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 10
ADD_A_B
MOV_D_A
LOAD_B make_stack_key
LOAD_C make_stack
CALL libc_setenv
LOAD_A 0
RET
make_stack_cycle:
LOAD_A 1
RET

; Build ARGS="make -f <file> <dependency>" and execute /bin/make.
; The child repeats the same bounded algorithm, providing a real dependency
; walk without using host commands.
make_build_dependency:
LOAD_A 0
LOAD_B make_child_args_len
STORE32_A_B
LOAD_B make_child_prefix
LOAD_D 8
CALL make_child_append
LOAD_B make_file_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_file_len
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
CALL make_child_append
LOAD_B make_space
LOAD_D 1
CALL make_child_append
LOAD_B make_dep_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_dep_len
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
CALL make_child_append

LOAD_B make_child_args_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B make_args_key
LOAD_C make_child_args
CALL libc_setenv
LOAD_B make_make_path
LOAD_C 13
LOAD_D 0
CALL libc_spawn
LOAD_D -1
CMP_A_D
JZ make_child_restore_error
MOV_B_A
LOAD_C make_child_status
CALL libc_wait
LOAD_B make_args_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B make_args_key
LOAD_C make_args
CALL libc_setenv
LOAD_B make_child_status
LOAD32_A_B
RET
make_child_restore_error:
LOAD_B make_args_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B make_args_key
LOAD_C make_args
CALL libc_setenv
LOAD_A 1
RET

; B=source, D=length. Append to bounded child argument buffer.
make_child_append:
MOV_A_B
LOAD_B make_child_source
STORE32_A_B
MOV_A_D
LOAD_B make_child_append_len
STORE32_A_B
LOAD_B make_child_args_len
LOAD32_A_B
MOV_D_A
LOAD_B make_child_args
ADD_B_D
MOV_C_B
LOAD_B make_child_append_len
LOAD32_A_B
MOV_D_A
LOAD_B make_child_source
LOAD32_A_B
MOV_B_A
MEM_COPY
LOAD_B make_child_args_len
LOAD32_A_B
MOV_D_A
LOAD_B make_child_append_len
LOAD32_A_B
MOV_B_A
MOV_A_D
ADD_A_B
LOAD_B make_child_args_len
STORE32_A_B
RET

; Convert $(NAME) to $NAME; shell performs the bounded environment expansion.
make_expand_recipe:
LOAD_A 0
LOAD_B make_recipe_scan
STORE32_A_B
LOAD_B make_recipe_out_len
STORE32_A_B
make_recipe_expand_loop:
LOAD_B make_recipe_scan
LOAD32_A_B
MOV_D_A
LOAD_B make_recipe_len
LOAD32_A_B
CMP_A_D
JZ make_recipe_expand_done
LOAD_B make_recipe_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 36
CMP_A_D
JNZ make_recipe_copy
LOAD_B make_recipe_scan
LOAD32_A_B
INC_A
MOV_D_A
LOAD_B make_recipe_len
LOAD32_A_B
CMP_A_D
JZ make_recipe_copy
LOAD_B make_recipe_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 40
CMP_A_D
JNZ make_recipe_copy
; Emit '$', skip '('; ')' is skipped by the normal copy branch below.
LOAD_A 36
CALL make_recipe_emit
LOAD_B make_recipe_scan
LOAD32_A_B
LOAD_D 2
MOV_B_D
ADD_A_B
LOAD_B make_recipe_scan
STORE32_A_B
JMP make_recipe_expand_loop
make_recipe_copy:
LOAD_B make_recipe_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_recipe_scan
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 41
CMP_A_D
JZ make_recipe_skip
CALL make_recipe_emit
make_recipe_skip:
LOAD_B make_recipe_scan
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_recipe_expand_loop
make_recipe_expand_done:
RET
make_recipe_emit:
PUSH_A
LOAD_B make_recipe_out_len
LOAD32_A_B
MOV_D_A
LOAD_B make_recipe_out
ADD_B_D
POP_A
STORE8_A_B
LOAD_B make_recipe_out_len
LOAD32_A_B
INC_A
STORE32_A_B
RET

; Parse current physical line and operator. A=1 assignment, 2 rule, 0 other.
make_line_kind:
LOAD_A 0
LOAD_B make_local
STORE32_A_B
make_kind_scan:
LOAD_B make_local
LOAD32_A_B
MOV_D_A
LOAD_B make_line_len
LOAD32_A_B
CMP_A_D
JZ make_kind_none
LOAD_B make_line_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 61
CMP_A_D
JZ make_kind_assignment
LOAD_D 58
CMP_A_D
JZ make_kind_rule
LOAD_B make_local
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_kind_scan
make_kind_assignment:
LOAD_B make_line_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_local
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_D
ADD_A_B
LOAD_B make_mark
STORE32_A_B
LOAD_A 1
RET
make_kind_rule:
LOAD_B make_line_ptr
LOAD32_A_B
PUSH_A
LOAD_B make_local
LOAD32_A_B
MOV_D_A
POP_A
MOV_B_D
ADD_A_B
LOAD_B make_mark
STORE32_A_B
LOAD_A 2
RET
make_kind_none:
LOAD_A 0
RET

make_next_line:
LOAD_B make_line_start
LOAD32_A_B
MOV_D_A
LOAD_B make_file_bytes
LOAD32_A_B
CMP_A_D
JZ make_next_line_none
LOAD_B make_file
ADD_B_D
MOV_A_B
LOAD_B make_line_ptr
STORE32_A_B
LOAD_B make_line_start
LOAD32_A_B
LOAD_B make_line_end
STORE32_A_B
make_line_end_scan:
LOAD_B make_line_end
LOAD32_A_B
MOV_D_A
LOAD_B make_file_bytes
LOAD32_A_B
CMP_A_D
JZ make_line_ready
LOAD_B make_file
ADD_B_D
LOAD8_A_B
LOAD_D 10
CMP_A_D
JZ make_line_ready
LOAD_B make_line_end
LOAD32_A_B
INC_A
STORE32_A_B
JMP make_line_end_scan
make_line_ready:
LOAD_B make_line_end
LOAD32_A_B
PUSH_A
LOAD_B make_line_start
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B make_line_len
STORE32_A_B
LOAD_A 1
RET
make_next_line_none:
LOAD_A 0
RET
make_advance_line:
LOAD_B make_line_end
LOAD32_A_B
PUSH_A
LOAD_B make_file_bytes
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ make_advance_store
INC_A
make_advance_store:
LOAD_B make_line_start
STORE32_A_B
RET

make_arg:
MOV_D_A
LOAD_B make_args_len
LOAD32_A_B
MOV_C_A
LOAD_B make_args
STR_TOKEN
RET

.org 24000
make_args_len: .dword 0
make_arg_index: .dword 0
make_dry_run: .dword 0
make_requested_ptr: .dword 0
make_requested_len: .dword 0
make_file_ptr: .dword 0
make_file_len: .dword 8
make_fd: .dword -1
make_file_bytes: .dword 0
make_line_start: .dword 0
make_line_end: .dword 0
make_line_ptr: .dword 0
make_line_len: .dword 0
make_local: .dword 0
make_mark: .dword 0
make_scan: .dword 0
make_candidate_len: .dword 0
make_target_ptr: .dword 0
make_target_len: .dword 0
make_deps_ptr: .dword 0
make_deps_len: .dword 0
make_recipe_ptr: .dword 0
make_recipe_len: .dword 0
make_recipe_scan: .dword 0
make_recipe_out_len: .dword 0
make_dep_index: .dword 0
make_dep_ptr: .dword 0
make_dep_len: .dword 0
make_rebuild: .dword 0
make_time_diff: .dword 0
make_status: .dword 0
make_child_args_len: .dword 0
make_child_source: .dword 0
make_child_append_len: .dword 0
make_child_status: .dword 0
make_stack_len: .dword 0
make_stack_index: .dword 0
make_stack_token_ptr: .dword 0
make_stack_token_len: .dword 0
make_args: .zero 2048
make_file: .zero 16384
make_recipe_out: .zero 2048
make_child_args: .zero 2048
make_stack: .zero 2048
make_target_stat: .zero 56
make_dep_stat_buf: .zero 56
make_args_key: .string "ARGS"
make_stack_key: .string "MAKE_STACK"
make_shell_command_key: .string "SH_COMMAND"
make_shell_arg: .string "sh"
make_shell_path: .string "/bin/sh.bin"
make_make_path: .string "/bin/make.bin"
make_child_prefix: .string "make -f "
make_space: .string " "
make_default_file: .string "Makefile"
make_empty: .byte 0
make_newline: .string "\n"
make_usage_text: .string "usage: make [-n] [-f file] [target]\n"
make_no_rule_text: .string "make: no rule\n"
make_cycle_text: .string "make: cycle\n"
make_error_text: .string "make error\n"
