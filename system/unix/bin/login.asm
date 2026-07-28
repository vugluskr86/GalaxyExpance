.protected
.export main
.import libc_puts
.import libc_open
.import libc_read
.import libc_close
.import libc_setgid
.import libc_setuid
.import libc_setenv
.import libc_spawn
.import libc_wait
.import userdb_find
.import userdb_field
.import password_hash
.import password_compare_constant

main:
LOAD_B login_banner
LOAD_C 20
CALL libc_puts
LOAD_B login_username
LOAD_C 32
SYSCALL 0x40
LOAD_D 0
CMP_A_D
JZ login_failed
LOAD_B login_username_bytes
STORE32_A_B

; Resolve the public account record.
LOAD_B passwd_path
LOAD_C 11
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ login_failed
LOAD_B login_fd
STORE32_A_B
MOV_B_A
LOAD_C login_passwd
LOAD_D 2048
CALL libc_read
LOAD_B login_passwd_bytes
STORE32_A_B
LOAD_B login_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B login_username_bytes
LOAD32_A_B
PUSH_A
LOAD_B login_passwd_bytes
LOAD32_A_B
MOV_C_A
LOAD_B login_passwd
LOAD_D login_username
POP_A
CALL userdb_find
LOAD_D -1
CMP_A_D
JZ login_failed
LOAD_B login_record
STORE32_A_B

; uid field 2
LOAD_B login_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 2
CALL userdb_field
LOAD_D -1
CMP_A_D
JZ login_failed
MOV_B_A
STR_TO_INT
LOAD_B login_uid
STORE32_A_B
; gid field 3
LOAD_B login_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 3
CALL userdb_field
LOAD_D -1
CMP_A_D
JZ login_failed
MOV_B_A
STR_TO_INT
LOAD_B login_gid
STORE32_A_B
; HOME field 5
LOAD_B login_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 5
CALL userdb_field
LOAD_B login_home
STORE32_A_B
MOV_A_C
LOAD_B login_home_bytes
STORE32_A_B
; SHELL field 6
LOAD_B login_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 6
CALL userdb_field
LOAD_B login_shell
STORE32_A_B
MOV_A_C
LOAD_B login_shell_bytes
STORE32_A_B

; Root opens shadow before dropping credentials.
LOAD_B shadow_path
LOAD_C 11
LOAD_D 0
CALL libc_open
LOAD_D -1
CMP_A_D
JZ login_failed
LOAD_B login_fd
STORE32_A_B
MOV_B_A
LOAD_C login_shadow
LOAD_D 2048
CALL libc_read
LOAD_B login_shadow_bytes
STORE32_A_B
LOAD_B login_fd
LOAD32_A_B
MOV_B_A
CALL libc_close
LOAD_B login_username_bytes
LOAD32_A_B
PUSH_A
LOAD_B login_shadow_bytes
LOAD32_A_B
MOV_C_A
LOAD_B login_shadow
LOAD_D login_username
POP_A
CALL userdb_find
LOAD_D -1
CMP_A_D
JZ login_failed
LOAD_B login_shadow_record
STORE32_A_B
; field 1 = numeric hash, field 2 = exactly eight salt bytes.
LOAD_B login_shadow_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 1
CALL userdb_field
MOV_B_A
STR_TO_INT
LOAD_B login_expected
STORE32_A_B
LOAD_B login_shadow_record
LOAD32_A_B
MOV_B_A
LOAD_C 2048
LOAD_D 2
CALL userdb_field
PUSH_A
POP_A
LOAD_B login_salt
STORE32_A_B

LOAD_B password_prompt
LOAD_C 10
CALL libc_puts
LOAD_B login_password
LOAD_C 255
SYSCALL 0x40
LOAD_D 0
CMP_A_D
JZ login_failed
MOV_C_A
LOAD_B login_salt
LOAD32_A_B
MOV_D_A
LOAD_B login_password
CALL password_hash
LOAD_B login_actual
STORE32_A_B
LOAD_B login_actual
LOAD_C login_expected
LOAD_D 4
CALL password_compare_constant
JZ login_failed

; Environment is stored in the current process and inherited by the shell.
LOAD_B user_key
LOAD_C login_username
LOAD_B login_username_bytes
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B user_key
LOAD_C login_username
CALL libc_setenv
LOAD_B login_home_bytes
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 4
ADD_A_B
MOV_D_A
LOAD_B login_home
LOAD32_A_B
MOV_C_A
LOAD_B home_key
CALL libc_setenv
LOAD_B login_shell_bytes
LOAD32_A_B
LOAD_B 65536
MUL_A_B
LOAD_B 5
ADD_A_B
MOV_D_A
LOAD_B login_shell
LOAD32_A_B
MOV_C_A
LOAD_B shell_key
CALL libc_setenv

LOAD_B login_gid
LOAD32_A_B
MOV_B_A
CALL libc_setgid
LOAD_B login_uid
LOAD32_A_B
MOV_B_A
CALL libc_setuid
LOAD_B login_shell
LOAD32_A_B
PUSH_A
LOAD_B login_shell_bytes
LOAD32_A_B
MOV_C_A
POP_A
MOV_B_A
CALL libc_spawn
MOV_B_A
LOAD_C login_child_status
CALL libc_wait
LOAD_A 0
RET

login_failed:
LOAD_B login_denied
LOAD_C 14
CALL libc_puts
LOAD_A 1
RET

.org 9400
login_fd: .dword -1
login_passwd_bytes: .dword 0
login_shadow_bytes: .dword 0
login_username_bytes: .dword 0
login_record: .dword 0
login_shadow_record: .dword 0
login_uid: .dword 0
login_gid: .dword 0
login_home: .dword 0
login_home_bytes: .dword 0
login_shell: .dword 0
login_shell_bytes: .dword 0
login_salt: .dword 0
login_expected: .dword 0
login_actual: .dword 0
login_child_status: .dword 0
login_username: .zero 32
login_password: .zero 256
login_passwd: .zero 2048
login_shadow: .zero 2048
passwd_path: .string "/etc/passwd"
shadow_path: .string "/etc/shadow"
user_key: .string "USER"
home_key: .string "HOME"
shell_key: .string "SHELL"
login_banner: .string "Pixel Cosmos login: "
password_prompt: .string "Password: "
login_denied: .string "Login failed.\n"
