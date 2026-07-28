.protected
.export main
.import libc_puts
.import libc_format_int
.import libc_strlen

; Safe ABI records:
; process_info: pid=0 uid=8 state=16 ticks=24 memory=32 command=44
; sysinfo: uptime=0 total_ram=8 free_ram=12 processes=24 threads=28
main:
top_refresh:
SYSCALL 0x43
LOAD_B top_sysinfo
SYSCALL 0x53
LOAD_D -1
CMP_A_D
JZ top_error
LOAD_B top_title
LOAD_C 9
CALL libc_puts
LOAD_B top_sysinfo
LOAD32_A_B
CALL top_print_number
LOAD_B top_ram_text
LOAD_C 5
CALL libc_puts
LOAD_B top_sysinfo
LOAD_D 8
ADD_B_D
LOAD32_A_B
PUSH_A
LOAD_B top_sysinfo
LOAD_D 12
ADD_B_D
LOAD32_A_B
MOV_B_A
POP_A
SUB_A_B
CALL top_print_number
LOAD_B top_slash
LOAD_C 1
CALL libc_puts
LOAD_B top_sysinfo
LOAD_D 8
ADD_B_D
LOAD32_A_B
CALL top_print_number
LOAD_B top_proc_text
LOAD_C 11
CALL libc_puts
LOAD_B top_sysinfo
LOAD_D 24
ADD_B_D
LOAD32_A_B
CALL top_print_number
LOAD_B top_thread_text
LOAD_C 9
CALL libc_puts
LOAD_B top_sysinfo
LOAD_D 28
ADD_B_D
LOAD32_A_B
CALL top_print_number
LOAD_B top_newline
LOAD_C 1
CALL libc_puts
LOAD_B top_header
LOAD_C 33
CALL libc_puts

; PROCESS_LIST is a bounded snapshot of u32 PIDs sorted by ticks descending.
LOAD_B top_pids
LOAD_C 256
SYSCALL 0x07
LOAD_D -1
CMP_A_D
JZ top_error
LOAD_B 4
DIV_A_B
LOAD_D 16
CMP_A_D
JNZ top_count_bounded
LOAD_A 16
top_count_bounded:
LOAD_B top_count
STORE32_A_B
LOAD_A 0
LOAD_B top_index
STORE32_A_B
top_process_loop:
LOAD_B top_index
LOAD32_A_B
MOV_D_A
LOAD_B top_count
LOAD32_A_B
CMP_A_D
JZ top_wait_key
LOAD_B top_index
LOAD32_A_B
LOAD_B 4
MUL_A_B
MOV_D_A
LOAD_B top_pids
ADD_B_D
LOAD32_A_B
MOV_B_A
LOAD_C top_info
LOAD_D 128
SYSCALL 0x0a
LOAD_D -1
CMP_A_D
JZ top_process_next
LOAD_B top_info
LOAD32_A_B
CALL top_print_field
LOAD_B top_info
LOAD_D 8
ADD_B_D
LOAD32_A_B
CALL top_print_field
LOAD_B top_info
LOAD_D 16
ADD_B_D
LOAD32_A_B
CALL top_print_state
LOAD_B top_info
LOAD_D 24
ADD_B_D
LOAD32_A_B
CALL top_print_field
LOAD_B top_info
LOAD_D 32
ADD_B_D
LOAD32_A_B
CALL top_print_field
LOAD_B top_info
LOAD_D 44
ADD_B_D
MOV_A_B
MOV_B_A
LOAD_C 64
CALL libc_strlen
LOAD_D -1
CMP_A_D
JZ top_process_next
MOV_C_A
LOAD_B top_info
LOAD_D 44
ADD_B_D
CALL libc_puts
LOAD_B top_newline
LOAD_C 1
CALL libc_puts
top_process_next:
LOAD_B top_index
LOAD32_A_B
INC_A
STORE32_A_B
JMP top_process_loop

top_wait_key:
LOAD_B top_key
LOAD_C 1
SYSCALL 0x40
LOAD_D -1
CMP_A_D
JZ top_sleep
JZ top_sleep
LOAD_B top_key
LOAD8_A_B
LOAD_D 113
CMP_A_D
JZ top_success
top_sleep:
LOAD_A 1000
SYSCALL 0x51
JMP top_refresh
top_success:
LOAD_A 0
RET
top_error:
LOAD_B top_error_text
LOAD_C 10
CALL libc_puts
LOAD_A 1
RET

top_print_field:
CALL top_print_number
LOAD_B top_space
LOAD_C 1
CALL libc_puts
RET
top_print_number:
MOV_B_A
LOAD_C top_number
LOAD_D 16
CALL libc_format_int
MOV_C_A
LOAD_B top_number
CALL libc_puts
RET

top_print_state:
LOAD_D 0
CMP_A_D
JZ top_state_ready
LOAD_D 1
CMP_A_D
JZ top_state_running
LOAD_D 2
CMP_A_D
JZ top_state_sleeping
LOAD_D 3
CMP_A_D
JZ top_state_stopped
LOAD_D 4
CMP_A_D
JZ top_state_zombie
JMP top_state_faulted
top_state_ready:
LOAD_B top_ready
LOAD_C 6
JMP top_state_emit
top_state_running:
LOAD_B top_running
LOAD_C 8
JMP top_state_emit
top_state_sleeping:
LOAD_B top_sleeping
LOAD_C 9
JMP top_state_emit
top_state_stopped:
LOAD_B top_stopped
LOAD_C 8
JMP top_state_emit
top_state_zombie:
LOAD_B top_zombie
LOAD_C 7
JMP top_state_emit
top_state_faulted:
LOAD_B top_faulted
LOAD_C 8
top_state_emit:
CALL libc_puts
LOAD_B top_space
LOAD_C 1
CALL libc_puts
RET

.org 21000
top_count: .dword 0
top_index: .dword 0
top_pids: .zero 256
top_info: .zero 128
top_sysinfo: .zero 40
top_number: .zero 16
top_key: .zero 1
top_title: .string "top - up "
top_ram_text: .string " RAM "
top_proc_text: .string " processes "
top_thread_text: .string " threads "
top_header: .string "PID USER STATE TICKS MEM COMMAND\n"
top_ready: .string "ready "
top_running: .string "running "
top_sleeping: .string "sleeping "
top_stopped: .string "stopped "
top_zombie: .string "zombie "
top_faulted: .string "faulted "
top_slash: .string "/"
top_space: .string " "
top_newline: .string "\n"
top_error_text: .string "top error\n"
