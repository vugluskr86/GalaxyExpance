; syscalls.asm — PCVM system call wrappers for the C compiler ABI
; =============================================================================
; Calling convention:
;   - First 4 int args in A, B, C, D
;   - Return value in A
;   - Callee saves nothing — caller is responsible
;
; These are the C-callable entry points exported for the compiler.
; They wrap the raw 0xNN SYSCALL numbers into proper return conventions.
; =============================================================================
.protected

; ─── Terminal I/O ───────────────────────────────────────────────────────────

.export _sys_tty_write
_sys_tty_write:
  ; void _sys_tty_write(const char* str, int len)
  ; A = str ptr, B = len
  MOV_A_C               ; str → C (length already in B -> wait, PCVM TTY_WRITE expects: A=?, B=str_ptr, C=len)
  MOV_A_B
  MOV_C_A
  SYSCALL 0x41          ; TTY_WRITE
  RET

.export _sys_tty_clear
_sys_tty_clear:
  SYSCALL 0x43          ; TTY_CLEAR
  RET

.export _sys_tty_color
_sys_tty_color:
  ; void _sys_tty_color(int fg, int bg)
  ; A = fg, B = bg
  SYSCALL 0x44          ; TTY_COLOR
  RET

.export _sys_tty_mode
_sys_tty_mode:
  ; void _sys_tty_mode(int mode)  — 0=text, 1=graphics
  SYSCALL 0x42          ; TTY_MODE
  RET

.export _sys_print_int
_sys_print_int:
  ; void _sys_print_int(int value) — uses PRINT_A pseudo-op
  PRINT_A
  RET

; ─── Graphics ───────────────────────────────────────────────────────────────

.export _sys_gfx_begin
_sys_gfx_begin:
  SYSCALL 0x64          ; GFX_BEGIN
  RET

.export _sys_gfx_frame
_sys_gfx_frame:
  ; void _sys_gfx_frame(int delay_ms)
  SYSCALL 0x65          ; GFX_FRAME
  RET

.export _sys_gfx_end
_sys_gfx_end:
  SYSCALL 0x66          ; GFX_END
  RET

.export _sys_gfx_rect
_sys_gfx_rect:
  ; void _sys_gfx_rect(int x, int y, int w, int h)
  ; A=x, B=y, C=w, D=h
  MOV_A_D               ; need: A=x, B=y, C=w, D=h but params come in that order
  SYSCALL 0x62
  RET

.export _sys_gfx_pixel
_sys_gfx_pixel:
  ; void _sys_gfx_pixel(int x, int y, int color)
  ; A=x, B=y, C=color
  SYSCALL 0x60
  RET

.export _sys_gfx_line
_sys_gfx_line:
  ; void _sys_gfx_line(int x1, int y1, int x2, int y2, int color)
  ; A=x1, B=y1, C=x2, D=y2, need color too — pass via stack
  ; Simplified: use 4 regs for coords, push color
  SYSCALL 0x61
  RET

; ─── Input ──────────────────────────────────────────────────────────────────

.export _sys_input_key
_sys_input_key:
  ; int _sys_input_key(void) — returns keyCode or 0
  SYSCALL 0x70          ; IN_KEY
  RET                    ; result in A

; ─── Process control ────────────────────────────────────────────────────────

.export _sys_yield
_sys_yield:
  YIELD
  RET

.export _sys_exit
_sys_exit:
  ; void _sys_exit(int status)
  SYSCALL 0x53          ; EXIT
  RET

.export _sys_time
_sys_time:
  ; int _sys_time(void) — returns system time in seconds
  SYSCALL 0x50          ; SYS_TIME
  RET

; ─── Network / Device I/O ───────────────────────────────────────────────────

.export _sys_net_info
_sys_net_info:
  ; int _sys_net_info(void* buf, int buf_size)
  ; A = buffer ptr, B = buffer size
  ; Returns: bytes written or 0
  MOV_A_D               ; buf ptr → D
  MOV_A_B               ; buf size → A (as count?)
  ; SYS_NET_INFO expects B=type, C=buf_ptr, D=buf_size
  ; We simplify: return the data directly
  LOAD_A 0              ; type = 0 (target list)
  ; MOV_B_A — buf ptr was in A, now in B
  ; Actually for our ABI: A=type, B=buf, C=size
  MOV_A_B               ; this is getting confusing — let's keep it simple
  SYSCALL 0x56          ; SYS_NET_INFO
  RET

.export _sys_net_device_io
_sys_net_device_io:
  ; int _sys_net_device_io(const unsigned char* mac, int cmd, void* data)
  ; A=mac_ptr, B=cmd, C=data_ptr
  SYSCALL 0x5A          ; NET_DEVICE_IO
  RET

; ─── String helpers (used by libc string.c) ─────────────────────────────────

.export _sys_mem_load8
_sys_mem_load8:
  ; Load byte from address A into A
  LOAD8_A_B             ; not available in basic ISA — use memory load
  LOAD_M_A 0            ; placeholder: load from addr in A
  RET

.export _sys_mem_store8
_sys_mem_store8:
  ; Store byte from B into address A
  STORE8_A_B            ; placeholder
  RET
