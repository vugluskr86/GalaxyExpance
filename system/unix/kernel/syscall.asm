; IVT and syscall entry owned by kernel.bin.
.export syscall_init
.export syscall_handler
.export user_fault_handler
.import timer_handler
.import current_pid
.import process_spawn
.import process_exit
.import process_wait
.import process_kill
.import process_exec_commit
.import process_address
.import permission_setuid
.import permission_setgid
.import permission_getuid
.import permission_getgid

syscall_init:
; Default the architecturally used exception entries to a safe user-fault path.
LOAD_A user_fault_handler
LOAD_B 4
STORE32_A_B
LOAD_B 8
STORE32_A_B
LOAD_B 12
STORE32_A_B
LOAD_B 16
STORE32_A_B
LOAD_B 20
STORE32_A_B
LOAD_B 24
STORE32_A_B
LOAD_B 28
STORE32_A_B
LOAD_B 32
STORE32_A_B
LOAD_A timer_handler
LOAD_B 64
STORE32_A_B
LOAD_A syscall_handler
LOAD_B 128
STORE32_A_B
RET

syscall_handler:
KGET_FAULT
JMP kernel_dispatch

; A=syscall number, B/C/D=arguments.
kernel_dispatch:
LOAD_D 1
CMP_A_D
JZ syscall_exit
LOAD_D 3
CMP_A_D
JZ syscall_spawn
LOAD_D 4
CMP_A_D
JZ syscall_wait
LOAD_D 5
CMP_A_D
JZ syscall_getpid
LOAD_D 6
CMP_A_D
JZ syscall_kill
LOAD_D 8
CMP_A_D
JZ syscall_exec
LOAD_D 9
CMP_A_D
JZ syscall_getppid
LOAD_D 0x0b
CMP_A_D
JZ syscall_setuid
LOAD_D 0x0c
CMP_A_D
JZ syscall_setgid
LOAD_D 0x0d
CMP_A_D
JZ syscall_getuid
LOAD_D 0x0e
CMP_A_D
JZ syscall_getgid
; Device/VFS calls use the host only as a hardware mechanism.
KCALL_HOST
SYSRET

syscall_getpid:
LOAD_B current_pid
LOAD32_A_B
LOAD_D 0
SYSRET

syscall_getppid:
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D 4
ADD_B_D
LOAD32_A_B
LOAD_D 0
SYSRET

syscall_setuid:
KGET_ARG 1
CALL permission_setuid
LOAD_D 0
SYSRET

syscall_setgid:
KGET_ARG 1
CALL permission_setgid
LOAD_D 0
SYSRET

syscall_getuid:
CALL permission_getuid
LOAD_D 0
SYSRET

syscall_getgid:
CALL permission_getgid
LOAD_D 0
SYSRET

syscall_spawn:
LOAD_B current_pid
LOAD32_A_B
CALL process_spawn
LOAD_D 0
SYSRET

syscall_exit:
KGET_ARG 0
MOV_C_A
LOAD_B current_pid
LOAD32_A_B
CALL process_exit
LOAD_A 0
LOAD_D 0
SYSRET

syscall_wait:
KGET_ARG 1
MOV_C_A
LOAD_B current_pid
LOAD32_A_B
CALL process_wait
LOAD_D 0
SYSRET

syscall_kill:
KGET_ARG 1
PUSH_A
KGET_ARG 2
MOV_C_A
POP_A
CALL process_kill
LOAD_A 0
LOAD_D 0
SYSRET

syscall_exec:
LOAD_B current_pid
LOAD32_A_B
CALL process_exec_commit
LOAD_A 0
LOAD_D 0
SYSRET

user_fault_handler:
PRINT "PCOS kernel: user process fault"
PRINT "cause:"
PRINT_A
PRINT "fault address:"
MOV_A_B
PRINT_A
HALT
