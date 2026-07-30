; Pixel Cosmos system scanner.  It renders the initial spectrum view itself in
; protected-mode Assembly, then opens the interactive radio panel through the
; PCOS scanner ABI.  The panel is available only for an installed computer in
; an active star system; it owns real frequency, bearing, beam, polarization,
; RX/TX and scan-result state.
.protected
.export main
.import libc_puts

main:
; A graphics-capable GPU is required for the scanner mini-game.
LOAD_A 1
SYSCALL 0x42
LOAD_D -1
CMP_A_D
JZ scanner_graphics_error
SYSCALL 0x43
LOAD_A 0x7ee08a
LOAD_B 0
SYSCALL 0x44
SYSCALL 0x64
; Frame and spectrum/equalizer bars.  Each bar is intentionally rendered by
; the PCVM program, not by a terminal text placeholder.
LOAD_A 12
LOAD_B 16
LOAD_C 396
LOAD_D 256
SYSCALL 0x62
LOAD_A 28
LOAD_B 226
LOAD_C 12
LOAD_D 26
SYSCALL 0x62
LOAD_A 48
LOAD_B 192
LOAD_C 12
LOAD_D 60
SYSCALL 0x62
LOAD_A 68
LOAD_B 144
LOAD_C 12
LOAD_D 108
SYSCALL 0x62
LOAD_A 88
LOAD_B 177
LOAD_C 12
LOAD_D 75
SYSCALL 0x62
LOAD_A 108
LOAD_B 104
LOAD_C 12
LOAD_D 148
SYSCALL 0x62
LOAD_A 128
LOAD_B 159
LOAD_C 12
LOAD_D 93
SYSCALL 0x62
LOAD_A 148
LOAD_B 124
LOAD_C 12
LOAD_D 128
SYSCALL 0x62
LOAD_A 168
LOAD_B 72
LOAD_C 12
LOAD_D 180
SYSCALL 0x62
LOAD_A 188
LOAD_B 151
LOAD_C 12
LOAD_D 101
SYSCALL 0x62
LOAD_A 208
LOAD_B 184
LOAD_C 12
LOAD_D 68
SYSCALL 0x62
LOAD_A 228
LOAD_B 117
LOAD_C 12
LOAD_D 135
SYSCALL 0x62
LOAD_A 248
LOAD_B 94
LOAD_C 12
LOAD_D 158
SYSCALL 0x62
LOAD_A 268
LOAD_B 133
LOAD_C 12
LOAD_D 119
SYSCALL 0x62
LOAD_A 288
LOAD_B 173
LOAD_C 12
LOAD_D 79
SYSCALL 0x62
LOAD_A 308
LOAD_B 115
LOAD_C 12
LOAD_D 137
SYSCALL 0x62
LOAD_A 328
LOAD_B 82
LOAD_C 12
LOAD_D 170
SYSCALL 0x62
LOAD_A 348
LOAD_B 155
LOAD_C 12
LOAD_D 97
SYSCALL 0x62
LOAD_A 368
LOAD_B 204
LOAD_C 12
LOAD_D 48
SYSCALL 0x62
SYSCALL 0x66
LOAD_B scanner_title
LOAD_C 17
CALL libc_puts
LOAD_B scanner_status
LOAD_C 64
CALL libc_puts
SYSCALL 0x55
LOAD_D -1
CMP_A_D
JZ scanner_context_error
LOAD_A 0
RET

scanner_graphics_error:
LOAD_B scanner_graphics_error_text
LOAD_C 42
CALL libc_puts
LOAD_A 1
RET
scanner_context_error:
LOAD_B scanner_context_error_text
LOAD_C 72
CALL libc_puts
LOAD_A 1
RET

.org 9000
scanner_title: .string "PCOS scanner 1.1\n"
scanner_status: .string "spectrum acquired - opening antenna controls and target analysis\n"
scanner_graphics_error_text: .string "scanner: graphics-capable GPU is required\n"
scanner_context_error_text: .string "scanner: enter a star system and run this command from the installed PC\n"
