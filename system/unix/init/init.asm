.protected
.export main
.export init_validate_config
.import libc_puts
.import libc_open
.import libc_read
.import libc_close
.import libc_spawn
.import libc_wait

INIT_MAX_SERVICES: .equ 8
INIT_PATH_BYTES: .equ 128
INIT_REQUIRED_FLAGS: .equ 31
RESTART_NEVER: .equ 0
RESTART_FAILURE: .equ 1
RESTART_ALWAYS: .equ 2

main:
LOAD_B boot_start
LOAD_C 35
CALL libc_puts
LOAD_B config_path
LOAD_C 14
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ init_recovery
LOAD_B init_config_fd
STORE32_A_B
MOV_B_A
LOAD_C init_config
LOAD_D 2048
CALL libc_read
LOAD_D 0
CMP_A_D
JZ init_recovery_close
LOAD_B init_config_bytes
STORE32_A_B
CALL init_validate_config
JZ init_recovery_close
LOAD_B init_config_fd
LOAD32_A_B
MOV_B_A
CALL libc_close

; Spawn every parsed service path. Kernel never names logger/login itself.
LOAD_A 0
LOAD_B init_slot
STORE32_A_B
init_spawn_all:
LOAD_B init_slot
LOAD32_A_B
PUSH_A
LOAD_B init_service_count
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ init_spawn_done
CALL init_spawn_slot
LOAD_D 0
CMP_A_D
JZ init_recovery
LOAD_B init_slot
LOAD32_A_B
INC_A
STORE32_A_B
JMP init_spawn_all
init_spawn_done:
LOAD_B boot_services
LOAD_C 30
CALL libc_puts

; PID 1 reaps all children, maps PID back to its service and applies policy.
init_reap_loop:
LOAD_B -1
LOAD_C init_status
CALL libc_wait
LOAD_D -2
CMP_A_D
JZ init_shutdown
LOAD_D 0
CMP_A_D
JZ init_reap_loop
LOAD_B init_dead_pid
STORE32_A_B
LOAD_A 0
LOAD_B init_slot
STORE32_A_B
init_find_child:
LOAD_B init_slot
LOAD32_A_B
PUSH_A
LOAD_B init_service_count
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ init_reap_loop
CALL init_pid_address
LOAD32_A_B
PUSH_A
LOAD_B init_dead_pid
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ init_apply_policy
LOAD_B init_slot
LOAD32_A_B
INC_A
STORE32_A_B
JMP init_find_child

init_apply_policy:
CALL init_policy_address
LOAD32_A_B
LOAD_D RESTART_NEVER
CMP_A_D
JZ init_reap_loop
LOAD_D RESTART_FAILURE
CMP_A_D
JNZ init_restart
LOAD_B init_status
LOAD32_A_B
JZ init_reap_loop
init_restart:
CALL init_restart_address
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_D 5
CMP_A_D
JZ init_recovery
; One-second backoff is the rate limiter; five failures enter recovery.
LOAD_B 1000
SYSCALL 0x51
CALL init_spawn_slot
LOAD_D 0
CMP_A_D
JZ init_recovery
JMP init_reap_loop

init_shutdown:
LOAD_B boot_shutdown
LOAD_C 22
CALL libc_puts
LOAD_A 0
RET

init_recovery_close:
LOAD_B init_config_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
init_recovery:
LOAD_B boot_recovery
LOAD_C 43
CALL libc_puts
LOAD_B shell_path
LOAD_C 11
CALL libc_spawn
LOAD_A 1
RET

; Token grammar:
; [service NAME] exec=PATH restart=never|on-failure|always
; tty=VALUE user=VALUE group=VALUE
; Whitespace and blank lines are accepted. Values may not contain whitespace.
init_validate_config:
LOAD_A 0
LOAD_B init_token_index
STORE32_A_B
LOAD_B init_service_count
STORE32_A_B
LOAD_B init_current
STORE32_A_B
init_parse_token:
LOAD_B init_config
PUSH_A
LOAD_B init_config_bytes
LOAD32_A_B
MOV_C_A
LOAD_B init_token_index
LOAD32_A_B
MOV_D_A
POP_A
LOAD_B init_config
STR_TOKEN
JZ init_parse_finish
PUSH_A
MOV_A_B
LOAD_B init_token_ptr
STORE32_A_B
POP_A
LOAD_B init_token_len
STORE32_A_B

; Exact token "[service".
LOAD_D 8
CMP_A_D
JNZ init_parse_exec
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C key_service
LOAD_D 8
MEM_CMP
JZ init_parse_section
init_parse_exec:
CALL init_token_exec
JNZ init_parse_next
CALL init_token_restart
JNZ init_parse_next
CALL init_token_tty
JNZ init_parse_next
CALL init_token_user
JNZ init_parse_next
CALL init_token_group
JNZ init_parse_next
JMP init_parse_invalid

init_parse_section:
LOAD_B init_service_count
LOAD32_A_B
LOAD_D INIT_MAX_SERVICES
CMP_A_D
JZ init_parse_invalid
LOAD_B init_current
STORE32_A_B
INC_A
LOAD_B init_service_count
STORE32_A_B
; Skip the following NAME] token; malformed missing names fail at EOF/keys.
LOAD_B init_token_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP init_parse_next

init_parse_next:
LOAD_B init_token_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP init_parse_token

init_parse_finish:
LOAD_B init_service_count
LOAD32_A_B
JZ init_parse_invalid
LOAD_A 0
LOAD_B init_slot
STORE32_A_B
init_validate_slots:
LOAD_B init_slot
LOAD32_A_B
PUSH_A
LOAD_B init_service_count
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ init_parse_valid
CALL init_flags_address
LOAD32_A_B
LOAD_D INIT_REQUIRED_FLAGS
CMP_A_D
JNZ init_parse_invalid
LOAD_B init_slot
LOAD32_A_B
INC_A
STORE32_A_B
JMP init_validate_slots
init_parse_valid:
LOAD_A 1
RET
init_parse_invalid:
LOAD_A 0
RET

; Each token handler returns A=1 when it consumed the token, A=0 otherwise.
init_token_exec:
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 5
CMP_A_D
JZ init_parse_invalid
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C key_exec
LOAD_D 5
MEM_CMP
JNZ init_token_no
CALL init_current_path_address
MOV_A_B
LOAD_B init_copy_dest
STORE32_A_B
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 5
ADD_B_D
MOV_A_B
PUSH_A
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 5
SUB_A_D
MOV_D_A
LOAD_B init_copy_dest
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
MEM_COPY
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 5
SUB_A_D
PUSH_A
CALL init_current_length_address
POP_A
STORE32_A_B
LOAD_D 1
CALL init_set_flag
LOAD_A 1
RET

init_token_restart:
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C key_restart
LOAD_D 8
MEM_CMP
JNZ init_token_no
; Default never; exact allowed values overwrite it.
LOAD_A RESTART_NEVER
LOAD_B init_policy_value
STORE32_A_B
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 8
ADD_B_D
LOAD_C value_always
LOAD_D 6
MEM_CMP
JNZ init_restart_failure_value
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 14
CMP_A_D
JNZ init_parse_invalid
LOAD_A RESTART_ALWAYS
LOAD_B init_policy_value
STORE32_A_B
JMP init_restart_store
init_restart_failure_value:
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 8
ADD_B_D
LOAD_C value_failure
LOAD_D 10
MEM_CMP
JNZ init_restart_never_value
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 18
CMP_A_D
JNZ init_parse_invalid
LOAD_A RESTART_FAILURE
LOAD_B init_policy_value
STORE32_A_B
JMP init_restart_store
init_restart_never_value:
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_D 8
ADD_B_D
LOAD_C value_never
LOAD_D 5
MEM_CMP
JNZ init_parse_invalid
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 13
CMP_A_D
JNZ init_parse_invalid
init_restart_store:
LOAD_B init_policy_value
LOAD32_A_B
PUSH_A
CALL init_current_policy_address
POP_A
STORE32_A_B
LOAD_D 2
CALL init_set_flag
LOAD_A 1
RET

init_token_tty:
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 4
CMP_A_D
JZ init_parse_invalid
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C key_tty
LOAD_D 4
MEM_CMP
JNZ init_token_no
LOAD_D 4
CALL init_set_flag
LOAD_A 1
RET
init_token_user:
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 5
CMP_A_D
JZ init_parse_invalid
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C key_user
LOAD_D 5
MEM_CMP
JNZ init_token_no
; Supported installation identities are resolved without a host parser.
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 9
CMP_A_D
JNZ init_user_guest
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C value_user_root
LOAD_D 9
MEM_CMP
JNZ init_parse_invalid
LOAD_A 0
JMP init_user_store
init_user_guest:
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 10
CMP_A_D
JNZ init_parse_invalid
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C value_user_guest
LOAD_D 10
MEM_CMP
JNZ init_parse_invalid
LOAD_A 1000
init_user_store:
PUSH_A
CALL init_current_uid_address
POP_A
STORE32_A_B
LOAD_D 8
CALL init_set_flag
LOAD_A 1
RET
init_token_group:
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 6
CMP_A_D
JZ init_parse_invalid
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C key_group
LOAD_D 6
MEM_CMP
JNZ init_token_no
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 10
CMP_A_D
JNZ init_group_users
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C value_group_root
LOAD_D 10
MEM_CMP
JNZ init_parse_invalid
LOAD_A 0
JMP init_group_store
init_group_users:
LOAD_B init_token_len
LOAD32_A_B
LOAD_D 11
CMP_A_D
JNZ init_parse_invalid
LOAD_B init_token_ptr
LOAD32_A_B
MOV_B_A
LOAD_C value_group_users
LOAD_D 11
MEM_CMP
JNZ init_parse_invalid
LOAD_A 100
init_group_store:
PUSH_A
CALL init_current_gid_address
POP_A
STORE32_A_B
LOAD_D 16
CALL init_set_flag
LOAD_A 1
RET
init_token_no:
LOAD_A 0
RET

; D=flag.
init_set_flag:
MOV_A_D
LOAD_B init_flag_value
STORE32_A_B
CALL init_current_flags_address
LOAD32_A_B
PUSH_A
LOAD_B init_flag_value
LOAD32_A_B
MOV_B_A
POP_A
OR_A_B
; Recompute address because OR uses B.
PUSH_A
CALL init_current_flags_address
POP_A
STORE32_A_B
RET

init_spawn_slot:
CALL init_path_address
MOV_A_B
PUSH_A
CALL init_length_address
LOAD32_A_B
MOV_C_A
; D packs gid:uid. Zero means inherit, which is correct for root services.
CALL init_gid_address
LOAD32_A_B
LOAD_B 65536
MUL_A_B
MOV_D_A
CALL init_uid_address
LOAD32_A_B
MOV_B_D
ADD_A_B
MOV_D_A
POP_A
MOV_B_A
CALL libc_spawn
LOAD_D -1
CMP_A_D
JZ init_spawn_slot_failed
PUSH_A
CALL init_pid_address
POP_A
STORE32_A_B
LOAD_A 1
RET
init_spawn_slot_failed:
LOAD_A 0
RET

; Address helpers use init_slot or init_current and return address in B/A.
init_path_address:
LOAD_B init_slot
LOAD32_A_B
JMP init_path_from_a
init_current_path_address:
LOAD_B init_current
LOAD32_A_B
init_path_from_a:
LOAD_B INIT_PATH_BYTES
MUL_A_B
LOAD_B init_paths
ADD_A_B
MOV_B_A
RET
init_length_address:
LOAD_B init_slot
LOAD32_A_B
JMP init_length_from_a
init_current_length_address:
LOAD_B init_current
LOAD32_A_B
init_length_from_a:
LOAD_B 4
MUL_A_B
LOAD_B init_path_lengths
ADD_A_B
MOV_B_A
RET
init_flags_address:
LOAD_B init_slot
LOAD32_A_B
JMP init_flags_from_a
init_current_flags_address:
LOAD_B init_current
LOAD32_A_B
init_flags_from_a:
LOAD_B 4
MUL_A_B
LOAD_B init_flags
ADD_A_B
MOV_B_A
RET
init_policy_address:
LOAD_B init_slot
LOAD32_A_B
JMP init_policy_from_a
init_current_policy_address:
LOAD_B init_current
LOAD32_A_B
init_policy_from_a:
LOAD_B 4
MUL_A_B
LOAD_B init_policies
ADD_A_B
MOV_B_A
RET
init_pid_address:
LOAD_B init_slot
LOAD32_A_B
LOAD_B 4
MUL_A_B
LOAD_B init_pids
ADD_A_B
MOV_B_A
RET
init_restart_address:
LOAD_B init_slot
LOAD32_A_B
LOAD_B 4
MUL_A_B
LOAD_B init_restarts
ADD_A_B
MOV_B_A
RET
init_uid_address:
LOAD_B init_slot
LOAD32_A_B
LOAD_B 4
MUL_A_B
LOAD_B init_uids
ADD_A_B
MOV_B_A
RET
init_gid_address:
LOAD_B init_slot
LOAD32_A_B
LOAD_B 4
MUL_A_B
LOAD_B init_gids
ADD_A_B
MOV_B_A
RET
init_current_uid_address:
LOAD_B init_current
LOAD32_A_B
LOAD_B 4
MUL_A_B
LOAD_B init_uids
ADD_A_B
MOV_B_A
RET
init_current_gid_address:
LOAD_B init_current
LOAD32_A_B
LOAD_B 4
MUL_A_B
LOAD_B init_gids
ADD_A_B
MOV_B_A
RET

.org 10000
init_config_fd: .dword -1
init_config_bytes: .dword 0
init_token_index: .dword 0
init_token_ptr: .dword 0
init_token_len: .dword 0
init_service_count: .dword 0
init_current: .dword 0
init_slot: .dword 0
init_dead_pid: .dword 0
init_status: .dword 0
init_policy_value: .dword 0
init_flag_value: .dword 0
init_copy_dest: .dword 0
init_path_lengths: .zero 32
init_flags: .zero 32
init_policies: .zero 32
init_pids: .zero 32
init_restarts: .zero 32
init_uids: .zero 32
init_gids: .zero 32
init_paths: .zero 1024
init_config: .zero 2048
config_path: .string "/etc/init.conf"
shell_path: .string "/bin/sh.bin"
key_service: .string "[service"
key_exec: .string "exec="
key_restart: .string "restart="
key_tty: .string "tty="
key_user: .string "user="
key_group: .string "group="
value_never: .string "never"
value_failure: .string "on-failure"
value_always: .string "always"
value_user_guest: .string "user=guest"
value_group_users: .string "group=users"
value_user_root: .string "user=root"
value_group_root: .string "group=root"
boot_start: .string "[init] console/root/config startup\n"
boot_services: .string "[init] configured services started\n"
boot_recovery: .string "[init] recovery shell: config/service error\n"
boot_shutdown: .string "[init] shutdown clean\n"
