; Stage 5 credential and Unix rwx policy.
.export permissions_init
.export permission_check
.export permission_setuid
.export permission_setgid
.export permission_getuid
.export permission_getgid
.import current_pid
.import process_address

PERM_PCB_UID: .equ 48
PERM_PCB_GID: .equ 52
PERM_PCB_EUID: .equ 56
PERM_PCB_EGID: .equ 60
EPERM: .equ 1

.org 5200
permission_inode_uid: .dword 0
permission_inode_gid: .dword 0
permission_mode: .dword 0
permission_wanted: .dword 0
permission_new_id: .dword 0

permissions_init:
PRINT "PCOS kernel: UID/GID permissions ready"
RET

; A=inode uid, B=inode gid, C=mode, D=requested rwx bit (4/2/1).
; Returns A=1 when allowed, A=0 otherwise. Effective UID 0 bypasses checks.
permission_check:
LOAD_B permission_inode_uid
STORE32_A_B
MOV_A_B
LOAD_B permission_inode_gid
STORE32_A_B
MOV_A_C
LOAD_B permission_mode
STORE32_A_B
MOV_A_D
LOAD_B permission_wanted
STORE32_A_B
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_EUID
ADD_B_D
LOAD32_A_B
JZ permission_allow
PUSH_A
LOAD_B permission_inode_uid
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ permission_owner
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_EGID
ADD_B_D
LOAD32_A_B
PUSH_A
LOAD_B permission_inode_gid
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ permission_group
LOAD_B permission_mode
LOAD32_A_B
LOAD_B 7
AND_A_B
JMP permission_test
permission_owner:
LOAD_B permission_mode
LOAD32_A_B
LOAD_B 64
DIV_A_B
JMP permission_test
permission_group:
LOAD_B permission_mode
LOAD32_A_B
LOAD_B 8
DIV_A_B
permission_test:
LOAD_B permission_wanted
LOAD32_A_B
PUSH_A
LOAD_B permission_mode
LOAD32_A_B
LOAD_B 7
AND_A_B
MOV_B_A
POP_A
AND_A_B
JZ permission_deny
LOAD_A 1
RET
permission_allow:
LOAD_A 1
RET
permission_deny:
LOAD_A 0
RET

permission_getuid:
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_UID
ADD_B_D
LOAD32_A_B
RET

permission_getgid:
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_GID
ADD_B_D
LOAD32_A_B
RET

; A=new UID. UID 0 may select any UID; an unprivileged process may only
; restore its real UID. Returns A=0 or -EPERM.
permission_setuid:
LOAD_B permission_new_id
STORE32_A_B
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_EUID
ADD_B_D
LOAD32_A_B
JZ permission_setuid_commit
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_UID
ADD_B_D
LOAD32_A_B
LOAD_B permission_new_id
LOAD32_A_B
MOV_D_A
CMP_A_D
JNZ permission_set_denied
permission_setuid_commit:
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_EUID
ADD_B_D
LOAD_B permission_new_id
LOAD32_A_B
STORE32_A_B
LOAD_A 0
RET

permission_setgid:
LOAD_B permission_new_id
STORE32_A_B
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_EUID
ADD_B_D
LOAD32_A_B
JNZ permission_set_denied
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PERM_PCB_GID
ADD_B_D
LOAD_B permission_new_id
LOAD32_A_B
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
LOAD_A 0
RET
permission_set_denied:
LOAD_A -1
RET
