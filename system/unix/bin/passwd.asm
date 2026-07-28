.protected
.export main
.import libc_puts
.import libc_open
.import libc_read
.import libc_write
.import libc_close
.import libc_chmod
.import libc_chown
.import libc_rename
.import userdb_find
.import userdb_field
.import password_hash
.import password_compare_constant
.import password_format_hex8

main:
LOAD_B passwd_user_prompt
LOAD_C 10
CALL libc_puts
LOAD_B passwd_username
LOAD_C 32
SYSCALL 0x40
LOAD_D 0
CMP_A_D
JZ passwd_failed
LOAD_B passwd_username_bytes
STORE32_A_B

LOAD_B shadow_paths
LOAD_D 15
ADD_B_D
LOAD_C 11
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ passwd_failed
LOAD_B passwd_fd
STORE32_A_B
MOV_B_A
LOAD_C passwd_shadow
LOAD_D 2048
CALL libc_read
LOAD_B passwd_shadow_bytes
STORE32_A_B
LOAD_B passwd_fd
LOAD32_A_B
MOV_B_A
CALL libc_close

LOAD_B passwd_username_bytes
LOAD32_A_B
PUSH_A
LOAD_B passwd_shadow_bytes
LOAD32_A_B
MOV_C_A
LOAD_B passwd_shadow
LOAD_D passwd_username
POP_A
CALL userdb_find
LOAD_D -1
CMP_A_D
JZ passwd_failed
LOAD_B passwd_record
STORE32_A_B
; Locate expected hash and salt.
MOV_B_A
LOAD_C 2048
LOAD_D 1
CALL userdb_field
PUSH_A
MOV_B_A
STR_TO_INT
LOAD_B passwd_expected
STORE32_A_B
POP_A
LOAD_B passwd_hash_field
STORE32_A_B
LOAD_B passwd_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 2
CALL userdb_field
PUSH_A
MOV_A_C
LOAD_D 8
CMP_A_D
JNZ passwd_failed
POP_A
LOAD_B passwd_salt
STORE32_A_B

LOAD_B passwd_old_prompt
LOAD_C 14
CALL libc_puts
LOAD_B passwd_old
LOAD_C 255
SYSCALL 0x40
LOAD_D 0
CMP_A_D
JZ passwd_failed
MOV_C_A
LOAD_B passwd_salt
LOAD32_A_B
MOV_D_A
LOAD_B passwd_old
CALL password_hash
LOAD_B passwd_actual
STORE32_A_B
LOAD_B passwd_actual
LOAD_C passwd_expected
LOAD_D 4
CALL password_compare_constant
JZ passwd_failed

LOAD_B passwd_new_prompt
LOAD_C 14
CALL libc_puts
LOAD_B passwd_new
LOAD_C 255
SYSCALL 0x40
LOAD_D 0
CMP_A_D
JZ passwd_failed
MOV_C_A
LOAD_B passwd_salt
LOAD32_A_B
MOV_D_A
LOAD_B passwd_new
CALL password_hash
; Replace the fixed-width eight digits after the existing 0x prefix.
PUSH_A
LOAD_B passwd_hash_field
LOAD32_A_B
MOV_B_A
LOAD_D 2
ADD_B_D
POP_A
CALL password_format_hex8

; Atomic update: create/truncate shadow.new, write complete buffer, set
; root:root 0600, then rename over /etc/shadow.
LOAD_B shadow_paths
LOAD_C 15
LOAD_D 13
CALL libc_open
LOAD_D -1
CMP_A_D
JZ passwd_failed
LOAD_B passwd_fd
STORE32_A_B
MOV_B_A
LOAD_C passwd_shadow
LOAD_B passwd_shadow_bytes
LOAD32_A_B
MOV_D_A
LOAD_B passwd_fd
LOAD32_A_B
MOV_B_A
CALL libc_write
LOAD_B passwd_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B shadow_paths
LOAD_C 15
LOAD_D 0x180
CALL libc_chmod
LOAD_B shadow_paths
LOAD_C 15
LOAD_D 0
CALL libc_chown
LOAD_B shadow_paths
LOAD_C 15
LOAD_D 0x000b000f
CALL libc_rename
LOAD_D 0
CMP_A_D
JNZ passwd_failed
LOAD_B passwd_ok
LOAD_C 27
CALL libc_puts
LOAD_A 0
RET

passwd_failed:
LOAD_B passwd_error
LOAD_C 24
CALL libc_puts
LOAD_A 1
RET

.org 9500
passwd_fd: .dword -1
passwd_shadow_bytes: .dword 0
passwd_username_bytes: .dword 0
passwd_record: .dword 0
passwd_hash_field: .dword 0
passwd_salt: .dword 0
passwd_expected: .dword 0
passwd_actual: .dword 0
passwd_username: .zero 32
passwd_old: .zero 256
passwd_new: .zero 256
passwd_shadow: .zero 2048
shadow_paths: .string "/etc/shadow.new"
.string "/etc/shadow"
passwd_user_prompt: .string "Username: "
passwd_old_prompt: .string "Old password: "
passwd_new_prompt: .string "New password: "
passwd_ok: .string "Password database updated.\n"
passwd_error: .string "Password update failed.\n"
