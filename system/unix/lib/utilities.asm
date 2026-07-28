; Shared implementation code for separate Stage 8 command binaries.
.export util_ls
.export util_cat
.export util_grep
.export util_cp
.export util_mv
.export util_mkdir
.export util_rm
.export util_link
.export util_chown
.export util_chgrp
.export util_user
.export util_find
.import libc_open
.import libc_read
.import libc_write
.import libc_close
.import libc_mkdir
.import libc_unlink
.import libc_rename
.import libc_chown
.import libc_link
.import libc_stat
.import libc_getuid
.import libc_getgid
.import libc_format_int
.import libc_puts
.import libc_fwrite

; Return token D from inherited ARGS in B/A. Token zero is the command.
util_arg:
LOAD_B util_arg_index
STORE32_A_B
LOAD_B util_args_key
LOAD_C util_args
LOAD_D 0x02000004
SYSCALL 0x33
LOAD_D -1
CMP_A_D
JZ util_arg_missing
LOAD_B util_args
MOV_C_B
MOV_B_A
ADD_B_C
MOV_A_B
LOAD_B util_arg_end
STORE32_A_B
LOAD_A util_args
LOAD_B util_arg_cursor
STORE32_A_B
LOAD_A 0
LOAD_B util_arg_current
STORE32_A_B
util_arg_lex:
LOAD_B util_arg_end
LOAD32_A_B
MOV_C_A
LOAD_B util_arg_cursor
LOAD32_A_B
MOV_B_A
LEX_TOKEN
JZ util_arg_missing
PUSH_A
MOV_A_B
LOAD_B util_arg_ptr
STORE32_A_B
POP_A
LOAD_B util_arg_len
STORE32_A_B
PUSH_A
MOV_A_D
LOAD_B util_arg_cursor
STORE32_A_B
POP_A
LOAD_B util_arg_current
LOAD32_A_B
MOV_D_A
LOAD_B util_arg_index
LOAD32_A_B
CMP_A_D
JZ util_arg_found
LOAD_B util_arg_current
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_arg_lex
util_arg_found:
; LEX_TOKEN keeps surrounding double quotes; expose the bounded payload.
LOAD_B util_arg_len
LOAD32_A_B
PUSH_A
LOAD_B util_arg_ptr
LOAD32_A_B
MOV_B_A
POP_A
PUSH_A
LOAD8_A_B
LOAD_D 34
CMP_A_D
JNZ util_arg_unquoted
INC_B
MOV_C_B
POP_A
LOAD_B 2
SUB_A_B
MOV_B_C
RET
util_arg_unquoted:
POP_A
RET
util_arg_missing:
LOAD_A 0
RET

util_usage:
LOAD_B 2
LOAD_C util_usage_text
LOAD_D 12
CALL libc_fwrite
LOAD_A 2
RET
util_failure:
LOAD_B 2
LOAD_C util_error_text
LOAD_D 14
CALL libc_fwrite
LOAD_A 1
RET

util_cat:
LOAD_A 1
LOAD_B util_cat_index
STORE32_A_B
util_cat_next:
LOAD_B util_cat_index
LOAD32_A_B
CALL util_arg
JZ util_cat_maybe_stdin
MOV_C_A
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ util_failure
LOAD_B util_fd_in
STORE32_A_B
JMP util_cat_loop
util_cat_maybe_stdin:
LOAD_B util_cat_index
LOAD32_A_B
LOAD_D 1
CMP_A_D
JNZ util_cat_all_done
LOAD_A 0
LOAD_B util_fd_in
STORE32_A_B
util_cat_loop:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
LOAD_C util_buffer
LOAD_D 512
CALL libc_read
JZ util_cat_done
LOAD_D -1
CMP_A_D
JZ util_failure
MOV_C_A
LOAD_B util_buffer
MOV_D_A
LOAD_C util_buffer
LOAD_B 1
CALL libc_fwrite
LOAD_D -1
CMP_A_D
JZ util_failure
JMP util_cat_loop
util_cat_done:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B util_cat_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_cat_next
util_cat_all_done:
LOAD_B util_cat_index
LOAD32_A_B
LOAD_D 1
CMP_A_D
JZ util_usage
LOAD_A 0
RET

util_cp:
LOAD_A 1
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_source_ptr
STORE32_A_B
POP_A
LOAD_B util_source_len
STORE32_A_B
LOAD_A 2
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_target_ptr
STORE32_A_B
POP_A
LOAD_B util_target_len
STORE32_A_B
LOAD_B util_source_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_source_len
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ util_cp_close_source
LOAD_B util_fd_in
STORE32_A_B
LOAD_B util_target_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_target_len
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
LOAD_D 13
CALL libc_open
LOAD_D -1
CMP_A_D
JZ util_failure
LOAD_B util_fd_out
STORE32_A_B
util_cp_loop:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
LOAD_C util_buffer
LOAD_D 512
CALL libc_read
JZ util_cp_done
LOAD_D -1
CMP_A_D
JZ util_cp_cleanup
MOV_D_A
LOAD_B util_fd_out
LOAD32_A_B
MOV_B_A
LOAD_C util_buffer
CALL libc_fwrite
LOAD_D -1
CMP_A_D
JZ util_cp_cleanup
JMP util_cp_loop
util_cp_done:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B util_fd_out
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_A 0
RET
util_cp_close_source:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
JMP util_failure
util_cp_cleanup:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B util_fd_out
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B util_target_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_target_len
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
CALL libc_unlink
JMP util_failure

util_mv:
LOAD_A 1
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_source_ptr
STORE32_A_B
POP_A
LOAD_B util_source_len
STORE32_A_B
LOAD_A 2
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_target_ptr
STORE32_A_B
POP_A
LOAD_B util_target_len
STORE32_A_B
; Pack target length and target offset relative to source.
LOAD_B util_target_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_source_ptr
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B util_offset
STORE32_A_B
LOAD_B util_target_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
PUSH_A
LOAD_B util_offset
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
MOV_D_A
LOAD_B util_source_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_source_len
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
CALL libc_rename
LOAD_D -18
CMP_A_D
JNZ util_mv_result
CALL util_cp
JNZ util_mv_result
LOAD_A 1
CALL util_arg
MOV_C_A
CALL libc_unlink
util_mv_result:
LOAD_D 0
CMP_A_D
JNZ util_failure
LOAD_A 0
RET

util_mkdir:
LOAD_A 1
CALL util_arg
JZ util_usage
LOAD_D 2
CMP_A_D
JNZ util_mkdir_single
PUSH_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ util_mkdir_single_pop
INC_B
LOAD8_A_B
LOAD_D 112
CMP_A_D
JNZ util_mkdir_single_pop
POP_A
LOAD_A 2
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_path_ptr
STORE32_A_B
POP_A
LOAD_B util_path_len
STORE32_A_B
LOAD_A 1
LOAD_B util_path_at
STORE32_A_B
util_mkdir_parents:
LOAD_B util_path_at
LOAD32_A_B
MOV_D_A
LOAD_B util_path_len
LOAD32_A_B
CMP_A_D
JZ util_mkdir_final
LOAD_B util_path_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
LOAD_D 47
CMP_A_D
JNZ util_mkdir_parent_next
LOAD_B util_path_at
LOAD32_A_B
MOV_C_A
LOAD_B util_path_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 0x1ed
CALL libc_mkdir
; EEXIST is intentionally accepted for an intermediate component.
util_mkdir_parent_next:
LOAD_B util_path_at
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_mkdir_parents
util_mkdir_final:
LOAD_B util_path_len
LOAD32_A_B
MOV_C_A
LOAD_B util_path_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 0x1ed
CALL libc_mkdir
LOAD_D 0
CMP_A_D
JNZ util_failure
RET
util_mkdir_single_pop:
POP_A
LOAD_A 1
CALL util_arg
util_mkdir_single:
MOV_C_A
LOAD_D 0x1ed
CALL libc_mkdir
LOAD_D 0
CMP_A_D
JNZ util_failure
RET

util_rm:
LOAD_A 1
CALL util_arg
JZ util_usage
LOAD_D 2
CMP_A_D
JNZ util_rm_single
PUSH_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ util_rm_option_bad
INC_B
LOAD8_A_B
LOAD_D 114
CMP_A_D
JNZ util_rm_option_bad
POP_A
LOAD_A 2
CALL util_arg
JZ util_usage
CALL util_walk_collect
LOAD_B util_walk_count
LOAD32_A_B
LOAD_B util_walk_index
STORE32_A_B
util_rm_reverse:
LOAD_B util_walk_index
LOAD32_A_B
JZ util_rm_recursive_done
DEC_A
LOAD_B util_walk_index
STORE32_A_B
PUSH_A
LOAD_B 4
MUL_A_B
MOV_D_A
LOAD_B util_walk_lengths
ADD_B_D
LOAD32_A_B
MOV_C_A
POP_A
LOAD_B 256
MUL_A_B
MOV_D_A
LOAD_B util_walk_paths
ADD_B_D
CALL libc_unlink
LOAD_D 0
CMP_A_D
JNZ util_failure
JMP util_rm_reverse
util_rm_recursive_done:
LOAD_A 0
RET
util_rm_option_bad:
POP_A
JMP util_usage
util_rm_single:
MOV_C_A
CALL libc_unlink
LOAD_D 0
CMP_A_D
JNZ util_failure
RET

util_link:
LOAD_A 1
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_source_ptr
STORE32_A_B
POP_A
LOAD_B util_source_len
STORE32_A_B
LOAD_A 2
CALL util_arg
JZ util_usage
PUSH_A
MOV_A_B
LOAD_B util_target_ptr
STORE32_A_B
POP_A
LOAD_B util_target_len
STORE32_A_B
LOAD_B util_target_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_source_ptr
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
LOAD_B util_offset
STORE32_A_B
LOAD_B util_target_len
LOAD32_A_B
LOAD_B 65536
MUL_A_B
PUSH_A
LOAD_B util_offset
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
MOV_D_A
LOAD_B util_source_ptr
LOAD32_A_B
PUSH_A
LOAD_B util_source_len
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
CALL libc_link
LOAD_D 0
CMP_A_D
JNZ util_failure
RET

util_chown:
LOAD_A 1
CALL util_arg
JZ util_usage
MOV_C_A
STR_TO_INT
LOAD_B util_owner
STORE32_A_B
LOAD_A 2
CALL util_arg
JZ util_usage
MOV_C_A
LOAD_B util_owner
LOAD32_A_B
MOV_D_A
CALL libc_chown
LOAD_D 0
CMP_A_D
JNZ util_failure
RET

util_chgrp:
LOAD_A 1
CALL util_arg
JZ util_usage
MOV_C_A
STR_TO_INT
LOAD_B 65536
MUL_A_B
LOAD_B util_owner
STORE32_A_B
LOAD_A 2
CALL util_arg
JZ util_usage
MOV_C_A
LOAD_B util_owner
LOAD32_A_B
MOV_D_A
CALL libc_chown
LOAD_D 0
CMP_A_D
JNZ util_failure
RET

util_user:
CALL libc_getuid
MOV_B_A
LOAD_C util_number
LOAD_D 16
CALL libc_format_int
MOV_C_A
LOAD_B util_number
CALL libc_puts
LOAD_B util_colon
LOAD_C 1
CALL libc_puts
CALL libc_getgid
MOV_B_A
LOAD_C util_number
LOAD_D 16
CALL libc_format_int
MOV_C_A
LOAD_B util_number
CALL libc_puts
LOAD_B util_newline
LOAD_C 1
CALL libc_puts
LOAD_A 0
RET

; Bounded directory commands. ls/find use READDIR and emit one buffer at a
; time; grep scans 512-byte chunks without loading the whole file.
util_ls:
LOAD_A 0
LOAD_B util_ls_all
STORE32_A_B
LOAD_B util_ls_long
STORE32_A_B
LOAD_A 1
CALL util_arg
JZ util_ls_default
; Accept any order of the bounded short options -a and -l.
PUSH_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ util_ls_path_token
INC_B
LOAD8_A_B
LOAD_D 97
CMP_A_D
JNZ util_ls_check_long
LOAD_A 1
LOAD_B util_ls_all
STORE32_A_B
JMP util_ls_option_path
util_ls_check_long:
LOAD_D 108
CMP_A_D
JNZ util_usage
LOAD_A 1
LOAD_B util_ls_long
STORE32_A_B
util_ls_option_path:
POP_A
LOAD_A 2
CALL util_arg
JNZ util_ls_have_path
JMP util_ls_default
util_ls_path_token:
POP_A
JMP util_ls_have_path
util_ls_default:
LOAD_B util_dot
LOAD_A 1
util_ls_have_path:
PUSH_A
MOV_A_B
LOAD_B util_ls_path_ptr
STORE32_A_B
POP_A
LOAD_B util_ls_path_len
STORE32_A_B
MOV_C_A
LOAD_B util_ls_path_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ util_failure
MOV_B_A
LOAD_B util_fd_in
STORE32_A_B
util_ls_read:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
LOAD_C util_dirents
LOAD_D 2304
SYSCALL 0x28
LOAD_D -1
CMP_A_D
JZ util_failure
JZ util_ls_done
LOAD_B util_dirent_bytes
STORE32_A_B
LOAD_A 0
LOAD_B util_dirent_at
STORE32_A_B
util_ls_entry:
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirent_bytes
LOAD32_A_B
CMP_A_D
JZ util_ls_read
; Skip dot-files unless -a was requested.
LOAD_B util_dirents
ADD_B_D
LOAD_D 12
ADD_B_D
LOAD8_A_B
LOAD_D 46
CMP_A_D
JNZ util_ls_emit
LOAD_B util_ls_all
LOAD32_A_B
JZ util_ls_next
util_ls_emit:
LOAD_B util_ls_long
LOAD32_A_B
JZ util_ls_emit_name
CALL util_ls_emit_long
util_ls_emit_name:
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirents
ADD_B_D
LOAD_D 8
ADD_B_D
LOAD32_A_B
LOAD_B util_name_len
STORE32_A_B
LOAD_B util_dirent_at
LOAD32_A_B
MOV_C_A
LOAD_B util_dirents
ADD_B_C
LOAD_D 12
ADD_B_D
MOV_A_B
MOV_C_A
LOAD_B util_name_len
LOAD32_A_B
MOV_D_A
LOAD_B 1
CALL libc_fwrite
LOAD_B util_newline
MOV_C_B
LOAD_D 1
LOAD_B 1
CALL libc_fwrite
util_ls_next:
LOAD_B util_dirent_at
LOAD32_A_B
LOAD_B 268
ADD_A_B
LOAD_B util_dirent_at
STORE32_A_B
JMP util_ls_entry
util_ls_done:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_A 0
RET

util_ls_emit_long:
; Build path/name in a bounded scratch buffer and stat it.
LOAD_B util_ls_path_len
LOAD32_A_B
MOV_D_A
LOAD_B util_ls_path_ptr
LOAD32_A_B
MOV_B_A
LOAD_C util_full_path
MEM_COPY
LOAD_B util_ls_path_len
LOAD32_A_B
MOV_D_A
LOAD_B util_full_path
ADD_B_D
LOAD_A 47
STORE8_A_B
; copy dirent name
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirents
ADD_B_D
LOAD_D 12
ADD_B_D
MOV_A_B
LOAD_B util_name_ptr
STORE32_A_B
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirents
ADD_B_D
LOAD_D 8
ADD_B_D
LOAD32_A_B
LOAD_B util_name_len
STORE32_A_B
LOAD_B util_ls_path_len
LOAD32_A_B
INC_A
MOV_D_A
LOAD_B util_full_path
ADD_B_D
MOV_C_B
LOAD_B util_name_len
LOAD32_A_B
MOV_D_A
LOAD_B util_name_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
LOAD_B util_ls_path_len
LOAD32_A_B
INC_A
PUSH_A
LOAD_B util_name_len
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
MOV_C_A
LOAD_B util_full_path
LOAD_D util_stat
CALL libc_stat
LOAD_D 0
CMP_A_D
JNZ util_failure
; type mode uid gid size
LOAD_B util_stat
LOAD_D 4
ADD_B_D
LOAD32_A_B
CALL util_print_number_space
LOAD_B util_stat
LOAD_D 16
ADD_B_D
LOAD32_A_B
CALL util_print_number_space
LOAD_B util_stat
LOAD_D 8
ADD_B_D
LOAD32_A_B
CALL util_print_number_space
LOAD_B util_stat
LOAD_D 12
ADD_B_D
LOAD32_A_B
CALL util_print_number_space
LOAD_B util_stat
LOAD_D 20
ADD_B_D
LOAD32_A_B
CALL util_print_number_space
RET

util_print_number_space:
MOV_B_A
LOAD_C util_number
LOAD_D 16
CALL libc_format_int
MOV_D_A
LOAD_B 1
LOAD_C util_number
CALL libc_fwrite
LOAD_B 1
LOAD_C util_space
LOAD_D 1
CALL libc_fwrite
RET

util_find:
LOAD_A 1
CALL util_arg
JNZ util_find_path
LOAD_B util_dot
LOAD_A 1
util_find_path:
CALL util_walk_collect
LOAD_A 0
LOAD_B util_walk_index
STORE32_A_B
util_find_emit:
LOAD_B util_walk_index
LOAD32_A_B
MOV_D_A
LOAD_B util_walk_count
LOAD32_A_B
CMP_A_D
JZ util_find_done
LOAD_B util_walk_index
LOAD32_A_B
PUSH_A
LOAD_B 4
MUL_A_B
MOV_D_A
LOAD_B util_walk_lengths
ADD_B_D
LOAD32_A_B
MOV_D_A
POP_A
LOAD_B 256
MUL_A_B
MOV_C_A
LOAD_B util_walk_paths
ADD_B_C
MOV_C_B
LOAD_B 1
CALL libc_fwrite
LOAD_B 1
LOAD_C util_newline
LOAD_D 1
CALL libc_fwrite
LOAD_B util_walk_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_find_emit
util_find_done:
LOAD_A 0
RET

; Collect a directory tree into a fixed 16-entry, PATH_MAX-bounded queue.
; B=root path, A=bytes. Regular files remain a one-entry traversal.
util_walk_collect:
PUSH_A
MOV_A_B
LOAD_B util_walk_root_ptr
STORE32_A_B
POP_A
LOAD_B util_walk_root_len
STORE32_A_B
LOAD_B util_walk_root_len
LOAD32_A_B
MOV_D_A
LOAD_B util_walk_root_ptr
LOAD32_A_B
MOV_B_A
LOAD_C util_walk_paths
MEM_COPY
LOAD_B util_walk_root_len
LOAD32_A_B
LOAD_B util_walk_lengths
STORE32_A_B
LOAD_A 1
LOAD_B util_walk_count
STORE32_A_B
LOAD_A 0
LOAD_B util_walk_index
STORE32_A_B
util_walk_next:
LOAD_B util_walk_index
LOAD32_A_B
MOV_D_A
LOAD_B util_walk_count
LOAD32_A_B
CMP_A_D
JZ util_walk_done
; current pointer/length
LOAD_B util_walk_index
LOAD32_A_B
PUSH_A
LOAD_B 256
MUL_A_B
MOV_D_A
LOAD_B util_walk_paths
ADD_B_D
MOV_A_B
LOAD_B util_walk_current_ptr
STORE32_A_B
POP_A
LOAD_B 4
MUL_A_B
MOV_D_A
LOAD_B util_walk_lengths
ADD_B_D
LOAD32_A_B
LOAD_B util_walk_current_len
STORE32_A_B
MOV_C_A
LOAD_B util_walk_current_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ util_walk_advance
LOAD_B util_walk_fd
STORE32_A_B
util_walk_read:
LOAD_B util_walk_fd
LOAD32_A_B
MOV_B_A
LOAD_C util_dirents
LOAD_D 2304
SYSCALL 0x28
JZ util_walk_close
LOAD_D -1
CMP_A_D
JZ util_walk_close
LOAD_B util_dirent_bytes
STORE32_A_B
LOAD_A 0
LOAD_B util_dirent_at
STORE32_A_B
util_walk_entry:
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirent_bytes
LOAD32_A_B
CMP_A_D
JZ util_walk_read
LOAD_B util_walk_count
LOAD32_A_B
LOAD_D 16
CMP_A_D
JZ util_walk_skip_entry
; destination queue slot
LOAD_B util_walk_count
LOAD32_A_B
LOAD_B 256
MUL_A_B
MOV_D_A
LOAD_B util_walk_paths
ADD_B_D
MOV_A_B
LOAD_B util_walk_dest
STORE32_A_B
; parent
LOAD_B util_walk_current_len
LOAD32_A_B
MOV_D_A
LOAD_B util_walk_dest
LOAD32_A_B
MOV_C_A
LOAD_B util_walk_current_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
; slash
LOAD_B util_walk_current_len
LOAD32_A_B
MOV_D_A
LOAD_B util_walk_dest
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD_A 47
STORE8_A_B
; entry name pointer and length
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirents
ADD_B_D
LOAD_D 8
ADD_B_D
LOAD32_A_B
LOAD_B util_name_len
STORE32_A_B
LOAD_B util_dirent_at
LOAD32_A_B
MOV_D_A
LOAD_B util_dirents
ADD_B_D
LOAD_D 12
ADD_B_D
MOV_A_B
LOAD_B util_name_ptr
STORE32_A_B
; destination after parent slash
LOAD_B util_walk_current_len
LOAD32_A_B
INC_A
MOV_D_A
LOAD_B util_walk_dest
LOAD32_A_B
MOV_B_A
ADD_B_D
MOV_C_B
LOAD_B util_name_len
LOAD32_A_B
MOV_D_A
LOAD_B util_name_ptr
LOAD32_A_B
MOV_B_A
MEM_COPY
; save new length
LOAD_B util_walk_current_len
LOAD32_A_B
INC_A
PUSH_A
LOAD_B util_name_len
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
PUSH_A
LOAD_B util_walk_count
LOAD32_A_B
LOAD_B 4
MUL_A_B
MOV_D_A
LOAD_B util_walk_lengths
ADD_B_D
POP_A
STORE32_A_B
LOAD_B util_walk_count
LOAD32_A_B
INC_A
STORE32_A_B
util_walk_skip_entry:
LOAD_B util_dirent_at
LOAD32_A_B
LOAD_B 268
ADD_A_B
LOAD_B util_dirent_at
STORE32_A_B
JMP util_walk_entry
util_walk_close:
LOAD_B util_walk_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
util_walk_advance:
LOAD_B util_walk_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_walk_next
util_walk_done:
LOAD_B util_walk_count
LOAD32_A_B
RET

util_grep:
LOAD_A 0
LOAD_B util_grep_numbers
STORE32_A_B
; grep [-n] pattern file
LOAD_A 1
CALL util_arg
JZ util_usage
LOAD_D 2
CMP_A_D
JNZ util_grep_pattern
PUSH_A
LOAD8_A_B
LOAD_D 45
CMP_A_D
JNZ util_grep_pattern_pop
INC_B
LOAD8_A_B
LOAD_D 110
CMP_A_D
JNZ util_grep_pattern_pop
POP_A
LOAD_A 1
LOAD_B util_grep_numbers
STORE32_A_B
LOAD_A 3
LOAD_B util_grep_file_index
STORE32_A_B
LOAD_A 2
CALL util_arg
JZ util_usage
JMP util_grep_save_pattern
util_grep_pattern_pop:
POP_A
util_grep_pattern:
LOAD_A 2
LOAD_B util_grep_file_index
STORE32_A_B
LOAD_A 1
CALL util_arg
JZ util_usage
util_grep_save_pattern:
PUSH_A
MOV_A_B
LOAD_B util_pattern_ptr
STORE32_A_B
POP_A
LOAD_B util_pattern_len
STORE32_A_B
LOAD_B util_grep_file_index
LOAD32_A_B
CALL util_arg
JZ util_usage
MOV_C_A
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ util_failure
LOAD_B util_fd_in
STORE32_A_B
LOAD_A 1
LOAD_B util_line_number
STORE32_A_B
LOAD_A 0
LOAD_B util_line_len
STORE32_A_B
LOAD_B util_grep_matches
STORE32_A_B
util_grep_read:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
LOAD_C util_buffer
LOAD_D 512
CALL libc_read
JZ util_grep_eof
LOAD_D -1
CMP_A_D
JZ util_grep_error
LOAD_B util_chunk_len
STORE32_A_B
LOAD_A 0
LOAD_B util_chunk_at
STORE32_A_B
util_grep_byte:
LOAD_B util_chunk_at
LOAD32_A_B
MOV_D_A
LOAD_B util_chunk_len
LOAD32_A_B
CMP_A_D
JZ util_grep_read
LOAD_B util_buffer
ADD_B_D
LOAD8_A_B
LOAD_B util_char
STORE32_A_B
; Preserve at most 511 data bytes plus a newline in the bounded line buffer.
LOAD_B util_line_len
LOAD32_A_B
LOAD_D 511
CMP_A_D
JZ util_grep_error
MOV_D_A
LOAD_B util_char
LOAD32_A_B
PUSH_A
LOAD_B util_line
ADD_B_D
POP_A
STORE8_A_B
LOAD_B util_line_len
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B util_char
LOAD32_A_B
LOAD_D 10
CMP_A_D
JNZ util_grep_next_byte
CALL util_grep_match_line
LOAD_A 0
LOAD_B util_line_len
STORE32_A_B
LOAD_B util_line_number
LOAD32_A_B
INC_A
STORE32_A_B
util_grep_next_byte:
LOAD_B util_chunk_at
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_grep_byte
util_grep_eof:
LOAD_B util_line_len
LOAD32_A_B
JZ util_grep_close
CALL util_grep_match_line
util_grep_close:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B util_grep_matches
LOAD32_A_B
JZ util_grep_not_found
LOAD_A 0
RET
util_grep_not_found:
LOAD_A 1
RET
util_grep_error:
LOAD_B util_fd_in
LOAD32_A_B
MOV_B_A
CALL libc_close
JMP util_failure

; Search the current bounded line for the pattern and emit the complete line.
util_grep_match_line:
LOAD_A 0
LOAD_B util_match_at
STORE32_A_B
util_grep_match_scan:
LOAD_B util_match_at
LOAD32_A_B
MOV_D_A
LOAD_B util_line_len
LOAD32_A_B
CMP_A_D
JZ util_grep_no_match
LOAD_A 0
LOAD_B util_pattern_at
STORE32_A_B
util_grep_match_bytes:
LOAD_B util_pattern_at
LOAD32_A_B
MOV_D_A
LOAD_B util_pattern_len
LOAD32_A_B
CMP_A_D
JZ util_grep_emit
; line[match_at + pattern_at]
LOAD_B util_match_at
LOAD32_A_B
PUSH_A
LOAD_B util_pattern_at
LOAD32_A_B
MOV_B_A
POP_A
ADD_A_B
MOV_D_A
LOAD_B util_line_len
LOAD32_A_B
CMP_A_D
JZ util_grep_advance_match
LOAD_B util_line
ADD_B_D
LOAD8_A_B
LOAD_B util_char
STORE32_A_B
; pattern[pattern_at]
LOAD_B util_pattern_ptr
LOAD32_A_B
MOV_B_A
LOAD_B util_pattern_at
LOAD32_A_B
MOV_D_A
MOV_B_A
; restore pattern base after loading the offset
LOAD_B util_pattern_ptr
LOAD32_A_B
MOV_B_A
ADD_B_D
LOAD8_A_B
MOV_D_A
LOAD_B util_char
LOAD32_A_B
CMP_A_D
JNZ util_grep_advance_match
LOAD_B util_pattern_at
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_grep_match_bytes
util_grep_advance_match:
LOAD_B util_match_at
LOAD32_A_B
INC_A
STORE32_A_B
JMP util_grep_match_scan
util_grep_emit:
LOAD_A 1
LOAD_B util_grep_matches
STORE32_A_B
LOAD_B util_grep_numbers
LOAD32_A_B
JZ util_grep_emit_line
LOAD_B util_line_number
LOAD32_A_B
MOV_B_A
LOAD_C util_number
LOAD_D 16
CALL libc_format_int
MOV_D_A
LOAD_B 1
LOAD_C util_number
CALL libc_fwrite
LOAD_B 1
LOAD_C util_colon
LOAD_D 1
CALL libc_fwrite
util_grep_emit_line:
LOAD_B 1
LOAD_C util_line
LOAD_B util_line_len
LOAD32_A_B
MOV_D_A
LOAD_B 1
CALL libc_fwrite
util_grep_no_match:
RET

.org 16000
util_arg_index: .dword 0
util_arg_end: .dword 0
util_arg_cursor: .dword 0
util_arg_current: .dword 0
util_arg_ptr: .dword 0
util_arg_len: .dword 0
util_fd_in: .dword -1
util_fd_out: .dword -1
util_cat_index: .dword 0
util_source_ptr: .dword 0
util_source_len: .dword 0
util_target_ptr: .dword 0
util_target_len: .dword 0
util_offset: .dword 0
util_owner: .dword 0
util_path_ptr: .dword 0
util_path_len: .dword 0
util_path_at: .dword 0
util_ls_all: .dword 0
util_ls_long: .dword 0
util_ls_path_ptr: .dword 0
util_ls_path_len: .dword 0
util_dirent_at: .dword 0
util_dirent_bytes: .dword 0
util_name_len: .dword 0
util_name_ptr: .dword 0
util_grep_numbers: .dword 0
util_grep_file_index: .dword 0
util_pattern_ptr: .dword 0
util_pattern_len: .dword 0
util_line_number: .dword 0
util_line_len: .dword 0
util_grep_matches: .dword 0
util_chunk_len: .dword 0
util_chunk_at: .dword 0
util_match_at: .dword 0
util_match_ptr: .dword 0
util_pattern_at: .dword 0
util_char: .dword 0
util_walk_root_ptr: .dword 0
util_walk_root_len: .dword 0
util_walk_count: .dword 0
util_walk_index: .dword 0
util_walk_current_ptr: .dword 0
util_walk_current_len: .dword 0
util_walk_dest: .dword 0
util_walk_fd: .dword -1
util_args: .zero 512
util_buffer: .zero 512
util_dirents: .zero 2304
util_line: .zero 512
util_full_path: .zero 512
util_stat: .zero 56
util_walk_lengths: .zero 64
util_walk_paths: .zero 4096
util_number: .zero 16
util_args_key: .string "ARGS"
util_usage_text: .string "usage error\n"
util_error_text: .string "command error\n"
util_dot: .string "."
util_colon: .string ":"
util_newline: .string "\n"
util_space: .string " "
