; Stage 3 process lifecycle.
; PCB is 64 bytes and all fields are little-endian u32/i32.
.export process_init
.export process_spawn
.export process_exec_commit
.export process_exit
.export process_fault
.export process_wait
.export process_kill
.export process_adopt_orphans
.export process_account_tick
.export current_pid
.export process_table
.export process_address

PCB_PID: .equ 0
PCB_PPID: .equ 4
PCB_PGID: .equ 8
PCB_STATE: .equ 12
PCB_EXIT: .equ 16
PCB_TICKS: .equ 20
PCB_PREEMPTIONS: .equ 24
PCB_EVENTS: .equ 28
PCB_UBASE: .equ 32
PCB_ULIMIT: .equ 36
PCB_KSP: .equ 40
PCB_FLAGS: .equ 44
PCB_UID: .equ 48
PCB_GID: .equ 52
PCB_EUID: .equ 56
PCB_EGID: .equ 60
PCB_SIZE: .equ 64
PROCESS_MAX: .equ 16

STATE_READY: .equ 0
STATE_RUNNING: .equ 1
STATE_SLEEPING: .equ 2
STATE_STOPPED: .equ 3
STATE_ZOMBIE: .equ 4
STATE_FAULTED: .equ 5

EVENT_TERM: .equ 1
EVENT_KILL: .equ 2
EVENT_CHLD: .equ 4

.org 4096
process_table: .zero 1024
current_pid: .dword 1
next_pid: .dword 2
process_count: .dword 1
init_pid: .dword 1
exec_pid: .dword 0
exec_ubase: .dword 0
exec_ulimit: .dword 0
exec_ksp: .dword 0
free_pid: .dword 0
allocated_pid: .dword 0
adopt_parent: .dword 0
adopt_cursor: .dword 0
wait_parent: .dword 0

; Return PCB address for PID in A. PID 0 is invalid.
process_address:
MOV_B_A
LOAD_A PCB_SIZE
MUL_A_B
LOAD_B process_table
ADD_A_B
MOV_B_A
RET

process_init:
LOAD_A 1
CALL process_address
LOAD_A 1
STORE32_A_B
LOAD_D PCB_PPID
ADD_B_D
LOAD_A 0
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD_A 1
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD_A STATE_RUNNING
STORE32_A_B
LOAD_D 36
ADD_B_D
LOAD_A 0
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
PRINT "PCOS kernel: process table PID 1 running"
RET

; A=parent PID, D=process group. Returns new PID in A, -1 when full.
process_spawn:
MOV_C_A
LOAD_B process_count
LOAD32_A_B
LOAD_D PROCESS_MAX
CMP_A_D
JZ process_spawn_full
LOAD_B free_pid
LOAD32_A_B
JZ process_spawn_next_pid
PUSH_A
LOAD_A 0
STORE32_A_B
POP_A
JMP process_spawn_have_pid
process_spawn_next_pid:
LOAD_B next_pid
LOAD32_A_B
PUSH_A
INC_A
STORE32_A_B
POP_A
process_spawn_have_pid:
PUSH_A
LOAD_B allocated_pid
STORE32_A_B
POP_A
PUSH_A
CALL process_address
POP_A
STORE32_A_B
LOAD_D PCB_PPID
ADD_B_D
MOV_A_C
STORE32_A_B
LOAD_D 4
ADD_B_D
; pgid defaults to parent for the first stage.
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD_A STATE_READY
STORE32_A_B
; Credentials occupy the final 16 bytes of every PCB. Stage 5's spawn path
; starts privileged services as root; login drops effective credentials.
LOAD_D 36
ADD_B_D
LOAD_A 0
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
LOAD_D 4
ADD_B_D
STORE32_A_B
LOAD_B process_count
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_B allocated_pid
LOAD32_A_B
RET
process_spawn_full:
LOAD_A -1
RET

; Exec commit is intentionally tiny: loader validates/reserves a new image
; before entering this routine. A=PID, B=new UBASE, C=new ULIMIT, D=new KSP.
process_exec_commit:
PUSH_A
MOV_A_B
LOAD_B exec_ubase
STORE32_A_B
MOV_A_C
LOAD_B exec_ulimit
STORE32_A_B
MOV_A_D
LOAD_B exec_ksp
STORE32_A_B
POP_A
LOAD_B exec_pid
STORE32_A_B

LOAD_B exec_ubase
LOAD32_A_B
PUSH_A
LOAD_B exec_pid
LOAD32_A_B
CALL process_address
LOAD_D PCB_UBASE
ADD_B_D
POP_A
STORE32_A_B

LOAD_B exec_ulimit
LOAD32_A_B
PUSH_A
LOAD_B exec_pid
LOAD32_A_B
CALL process_address
LOAD_D PCB_ULIMIT
ADD_B_D
POP_A
STORE32_A_B

LOAD_B exec_ksp
LOAD32_A_B
PUSH_A
LOAD_B exec_pid
LOAD32_A_B
CALL process_address
LOAD_D PCB_KSP
ADD_B_D
POP_A
STORE32_A_B

LOAD_B exec_pid
LOAD32_A_B
CALL process_address
LOAD_D PCB_STATE
ADD_B_D
LOAD_A STATE_READY
STORE32_A_B
RET

; A=PID, C=status.
process_exit:
PUSH_A
CALL process_address
LOAD_D PCB_STATE
ADD_B_D
LOAD_A STATE_ZOMBIE
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_C
STORE32_A_B
POP_A
CALL process_adopt_orphans
RET

; A=PID, C=128+fault.
process_fault:
PUSH_A
CALL process_address
LOAD_D PCB_STATE
ADD_B_D
LOAD_A STATE_FAULTED
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_C
STORE32_A_B
POP_A
CALL process_adopt_orphans
RET

; A=parent PID, C=child PID. Returns child PID or -1.
process_wait:
LOAD_B wait_parent
STORE32_A_B
MOV_A_C
CALL process_address
LOAD_D PCB_PPID
ADD_B_D
LOAD32_A_B
PUSH_A
LOAD_B wait_parent
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JNZ process_wait_none
MOV_A_C
CALL process_address
LOAD_D PCB_STATE
ADD_B_D
LOAD32_A_B
LOAD_D STATE_ZOMBIE
CMP_A_D
JZ process_wait_reap
LOAD_D STATE_FAULTED
CMP_A_D
JNZ process_wait_none
process_wait_reap:
; Clearing PID makes the slot reusable only after reap.
MOV_A_C
LOAD_B free_pid
STORE32_A_B
MOV_A_C
CALL process_address
LOAD_A 0
STORE32_A_B
LOAD_B process_count
LOAD32_A_B
DEC_A
STORE32_A_B
MOV_A_C
RET
process_wait_none:
LOAD_A -1
RET

; A=PID, C=EVENT_TERM or EVENT_KILL.
process_kill:
PUSH_A
CALL process_address
LOAD_D PCB_EVENTS
ADD_B_D
MOV_A_C
STORE32_A_B
MOV_A_C
LOAD_D EVENT_TERM
CMP_A_D
JZ process_kill_term
LOAD_D EVENT_KILL
CMP_A_D
JZ process_kill_force
POP_A
RET
process_kill_term:
LOAD_C 143
JMP process_kill_finish
process_kill_force:
LOAD_C 137
process_kill_finish:
POP_A
CALL process_address
LOAD_D PCB_STATE
ADD_B_D
LOAD_A STATE_ZOMBIE
STORE32_A_B
LOAD_D 4
ADD_B_D
MOV_A_C
STORE32_A_B
RET

; Children of A are adopted by PID 1. The bounded table makes the scan safe.
process_adopt_orphans:
LOAD_B adopt_parent
STORE32_A_B
LOAD_A 2
LOAD_B adopt_cursor
STORE32_A_B
process_adopt_loop:
LOAD_B adopt_cursor
LOAD32_A_B
PUSH_A
LOAD_B next_pid
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JZ process_adopt_done
CALL process_address
LOAD_D PCB_PPID
ADD_B_D
LOAD32_A_B
PUSH_A
LOAD_B adopt_parent
LOAD32_A_B
MOV_D_A
POP_A
CMP_A_D
JNZ process_adopt_next
LOAD_B adopt_cursor
LOAD32_A_B
CALL process_address
LOAD_D PCB_PPID
ADD_B_D
LOAD_A 1
STORE32_A_B
process_adopt_next:
LOAD_B adopt_cursor
LOAD32_A_B
INC_A
STORE32_A_B
JMP process_adopt_loop
process_adopt_done:
RET

process_account_tick:
LOAD_B current_pid
LOAD32_A_B
CALL process_address
LOAD_D PCB_TICKS
ADD_B_D
LOAD32_A_B
INC_A
STORE32_A_B
LOAD_D 4
ADD_B_D
LOAD32_A_B
INC_A
STORE32_A_B
RET
