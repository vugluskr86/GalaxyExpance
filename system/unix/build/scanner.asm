.export main

var_mode: .zero 4

var_sel: .zero 4

var_freq: .zero 4

var_bw: .zero 4

var_beam: .zero 4

var_pol: .zero 4

var_bearing: .zero 4

var_rx: .zero 4

var_tx: .zero 4

var_prog: .zero 4

var_scan: .zero 4

var_probe: .zero 4

var_surf: .zero 4

s_title_sys: .zero 4

s_title_pln: .zero 4

s_targets: .zero 4

s_help0: .zero 4

s_help_p: .zero 4

s_freq_lbl: .zero 4

s_bw_lbl: .zero 4

s_beam_lbl: .zero 4

s_pol_lbl: .zero 4

s_signal: .zero 4

s_mhz: .zero 4

s_deg: .zero 4

s_nl: .zero 4

s_bar_full: .zero 4

s_bar_half: .zero 4

s_bar_low: .zero 4

scan_target_buf: .zero 4

scan_target_count: .zero 4

min:
  LOAD_M_A a
  LOAD_M_B b
  SUB_A_B
  LOAD_B 0x80000000
  AND_A_B
  LOAD_A 1
  JNZ __c_lt0
  LOAD_A 0
  __c_lt0:
  POP_A
  CMP_A_B
  JZ __c_tern_else1
  LOAD_M_A a
  JMP __c_tern_end2
  __c_tern_else1:
  LOAD_M_A b
  __c_tern_end2:
  RET
  ; implicit return
  RET

draw_bar:
  LOAD_A 9
  PUSH_A
  POP_A
  LOAD_M_A label
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_M_A value
  LOAD_B 50
  LOAD_A 1
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else3
  LOAD_A 8
  PUSH_A
  POP_A
  LOAD_M_A s_bar_full
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  JMP __c_endif4
  __c_else3:
  LOAD_M_A value
  LOAD_B 10
  LOAD_A 1
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else5
  LOAD_A 8
  PUSH_A
  POP_A
  LOAD_M_A s_bar_half
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  JMP __c_endif6
  __c_else5:
  LOAD_A 8
  PUSH_A
  POP_A
  LOAD_M_A s_bar_low
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  __c_endif6:
  __c_endif4:
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  ; implicit return
  RET

draw_waterfall:
  LOAD_A 8315018
  PUSH_A
  POP_A
  LOAD_A 30
  PUSH_A
  POP_A
  LOAD_A 340
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 8315018
  PUSH_A
  POP_A
  LOAD_A 35
  PUSH_A
  POP_A
  LOAD_A 345
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 8315018
  PUSH_A
  POP_A
  LOAD_A 45
  PUSH_A
  POP_A
  LOAD_A 350
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 8315018
  PUSH_A
  POP_A
  LOAD_A 40
  PUSH_A
  POP_A
  LOAD_A 355
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 6006876
  PUSH_A
  POP_A
  LOAD_A 60
  PUSH_A
  POP_A
  LOAD_A 340
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 6006876
  PUSH_A
  POP_A
  LOAD_A 65
  PUSH_A
  POP_A
  LOAD_A 345
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 6006876
  PUSH_A
  POP_A
  LOAD_A 75
  PUSH_A
  POP_A
  LOAD_A 350
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 6006876
  PUSH_A
  POP_A
  LOAD_A 70
  PUSH_A
  POP_A
  LOAD_A 355
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 3829306
  PUSH_A
  POP_A
  LOAD_A 90
  PUSH_A
  POP_A
  LOAD_A 340
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 3829306
  PUSH_A
  POP_A
  LOAD_A 95
  PUSH_A
  POP_A
  LOAD_A 345
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 3829306
  PUSH_A
  POP_A
  LOAD_A 105
  PUSH_A
  POP_A
  LOAD_A 350
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 3829306
  PUSH_A
  POP_A
  LOAD_A 100
  PUSH_A
  POP_A
  LOAD_A 355
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 2706985
  PUSH_A
  POP_A
  LOAD_A 120
  PUSH_A
  POP_A
  LOAD_A 340
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 2706985
  PUSH_A
  POP_A
  LOAD_A 125
  PUSH_A
  POP_A
  LOAD_A 345
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 2706985
  PUSH_A
  POP_A
  LOAD_A 135
  PUSH_A
  POP_A
  LOAD_A 350
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 2706985
  PUSH_A
  POP_A
  LOAD_A 130
  PUSH_A
  POP_A
  LOAD_A 355
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 1584664
  PUSH_A
  POP_A
  LOAD_A 150
  PUSH_A
  POP_A
  LOAD_A 340
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  LOAD_A 1584664
  PUSH_A
  POP_A
  LOAD_A 165
  PUSH_A
  POP_A
  LOAD_A 350
  PUSH_A
  POP_A
  CALL _sys_gfx_pixel
  POP_A
  POP_A
  POP_A
  ; implicit return
  RET

draw_scanner:
  ; reserve 4 bytes for locals
  PUSH_A
  LOAD_A 0
  PUSH_A
  LOAD_A 1
  PUSH_A
  POP_A
  CALL _sys_tty_mode
  POP_A
  CALL _sys_gfx_begin
  LOAD_A 260
  PUSH_A
  POP_A
  LOAD_A 400
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 10
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 220
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 40
  PUSH_A
  POP_A
  LOAD_A 20
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 180
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 80
  PUSH_A
  POP_A
  LOAD_A 38
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 200
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 60
  PUSH_A
  POP_A
  LOAD_A 56
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 230
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 30
  PUSH_A
  POP_A
  LOAD_A 74
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 240
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 20
  PUSH_A
  POP_A
  LOAD_A 92
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 250
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 10
  PUSH_A
  POP_A
  LOAD_A 110
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 215
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 45
  PUSH_A
  POP_A
  LOAD_A 128
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 170
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 90
  PUSH_A
  POP_A
  LOAD_A 146
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 205
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 55
  PUSH_A
  POP_A
  LOAD_A 164
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 235
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 25
  PUSH_A
  POP_A
  LOAD_A 182
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 190
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 70
  PUSH_A
  POP_A
  LOAD_A 200
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 225
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 35
  PUSH_A
  POP_A
  LOAD_A 218
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 245
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 15
  PUSH_A
  POP_A
  LOAD_A 236
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 210
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 50
  PUSH_A
  POP_A
  LOAD_A 254
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 175
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 85
  PUSH_A
  POP_A
  LOAD_A 272
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 195
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 65
  PUSH_A
  POP_A
  LOAD_A 290
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 255
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 5
  PUSH_A
  POP_A
  LOAD_A 308
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  LOAD_A 165
  PUSH_A
  POP_A
  LOAD_A 14
  PUSH_A
  POP_A
  LOAD_A 95
  PUSH_A
  POP_A
  LOAD_A 326
  PUSH_A
  POP_A
  CALL _sys_gfx_rect
  POP_A
  POP_A
  POP_A
  POP_A
  CALL draw_waterfall
  CALL _sys_gfx_end
  LOAD_A 0
  PUSH_A
  POP_A
  CALL _sys_tty_mode
  POP_A
  LOAD_A 0
  PUSH_A
  POP_A
  LOAD_A 14149887
  PUSH_A
  POP_A
  CALL _sys_tty_color
  POP_A
  POP_A
  LOAD_A 38
  PUSH_A
  POP_A
  LOAD_M_A s_title_sys
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 8
  PUSH_A
  POP_A
  LOAD_M_A s_targets
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_B 255
  MOV_A_B
  PUSH_A
  LOAD_M_A scan_target_buf
  PUSH_A
  POP_A
  CALL _sys_scan_list
  POP_A
  POP_A
  STORE_A scan_target_count
  LOAD_M_A scan_target_count
  LOAD_B 0
  LOAD_A 1
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif8
  LOAD_M_A scan_target_count
  PUSH_A
  POP_A
  LOAD_M_A scan_target_buf
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  __c_endif8:
  LOAD_A 6
  PUSH_A
  POP_A
  LOAD_M_A s_freq_lbl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_M_A var_freq
  PUSH_A
  POP_A
  CALL _sys_print_int
  POP_A
  LOAD_A 5
  PUSH_A
  POP_A
  LOAD_M_A s_mhz
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 6
  PUSH_A
  POP_A
  LOAD_M_A s_bw_lbl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_M_A var_bw
  PUSH_A
  POP_A
  CALL _sys_print_int
  POP_A
  LOAD_A 5
  PUSH_A
  POP_A
  LOAD_M_A s_mhz
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 6
  PUSH_A
  POP_A
  LOAD_M_A s_beam_lbl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_M_A var_beam
  PUSH_A
  POP_A
  CALL _sys_print_int
  POP_A
  LOAD_A 5
  PUSH_A
  POP_A
  LOAD_M_A s_deg
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_M_A var_prog
  PUSH_A
  POP_A
  LOAD_M_A s_signal
  PUSH_A
  POP_A
  CALL draw_bar
  POP_A
  POP_A
  LOAD_A 42
  PUSH_A
  POP_A
  LOAD_M_A s_help0
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  ; implicit return
  POP_A
  RET

draw_planet:
  LOAD_A 0
  PUSH_A
  POP_A
  CALL _sys_tty_mode
  POP_A
  LOAD_A 0
  PUSH_A
  POP_A
  LOAD_A 14149887
  PUSH_A
  POP_A
  CALL _sys_tty_color
  POP_A
  POP_A
  LOAD_A 31
  PUSH_A
  POP_A
  LOAD_M_A s_title_pln
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 15
  PUSH_A
  POP_A
  LOAD_A __c_str16
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 28
  PUSH_A
  POP_A
  LOAD_A __c_str17
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 31
  PUSH_A
  POP_A
  LOAD_A __c_str18
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 30
  PUSH_A
  POP_A
  LOAD_A __c_str19
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 31
  PUSH_A
  POP_A
  LOAD_A __c_str20
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 36
  PUSH_A
  POP_A
  LOAD_A __c_str21
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 29
  PUSH_A
  POP_A
  LOAD_A __c_str22
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_M_A var_surf
  PUSH_A
  POP_A
  LOAD_A __c_str23
  PUSH_A
  POP_A
  CALL draw_bar
  POP_A
  POP_A
  LOAD_A 30
  PUSH_A
  POP_A
  LOAD_A __c_str24
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 36
  PUSH_A
  POP_A
  LOAD_M_A s_help_p
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  LOAD_A 1
  PUSH_A
  POP_A
  LOAD_M_A s_nl
  PUSH_A
  POP_A
  CALL _sys_tty_write
  POP_A
  POP_A
  ; implicit return
  RET

draw_screen:
  CALL _sys_tty_clear
  LOAD_M_A var_mode
  LOAD_B 1
  CMP_A_B
  LOAD_A 1
  JZ __c_eq11
  LOAD_A 0
  __c_eq11:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else9
  CALL draw_planet
  JMP __c_endif10
  __c_else9:
  CALL draw_scanner
  __c_endif10:
  ; implicit return
  RET

hks_freq_dn:
  LOAD_M_B var_freq
  LOAD_C 10
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A var_freq
  ; implicit return
  RET

hks_freq_up:
  LOAD_M_B var_freq
  LOAD_C 10
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A var_freq
  ; implicit return
  RET

hks_sel_up:
  LOAD_M_A var_sel
  LOAD_B 0
  LOAD_A 1
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif13
  LOAD_M_B var_sel
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  SUB_A_B
  MOV_B_A
  STORE_A var_sel
  __c_endif13:
  ; implicit return
  RET

hks_sel_dn:
  LOAD_M_A var_sel
  LOAD_B 7
  SUB_A_B
  LOAD_B 0x80000000
  AND_A_B
  LOAD_A 1
  JNZ __c_lt16
  LOAD_A 0
  __c_lt16:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif15
  LOAD_M_B var_sel
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A var_sel
  __c_endif15:
  ; implicit return
  RET

hks_save:
  LOAD_A 2
  STORE_A var_scan
  POP_A
  ; implicit return
  RET

hks_bw_up:
  LOAD_M_B var_bw
  LOAD_C 20
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A var_bw
  ; implicit return
  RET

hks_beam_up:
  LOAD_M_B var_beam
  LOAD_C 5
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A var_beam
  ; implicit return
  RET

hks_pol:
  LOAD_M_B var_pol
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  ADD_A_B
  MOV_B_A
  STORE_A var_pol
  LOAD_M_A var_pol
  LOAD_B 3
  LOAD_A 1
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif18
  LOAD_A 0
  STORE_A var_pol
  POP_A
  __c_endif18:
  ; implicit return
  RET

hk_scanner:
  LOAD_M_A key
  LOAD_B 37
  CMP_A_B
  LOAD_A 1
  JZ __c_eq21
  LOAD_A 0
  __c_eq21:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else19
  CALL hks_freq_dn
  JMP __c_endif20
  __c_else19:
  LOAD_M_A key
  LOAD_B 39
  CMP_A_B
  LOAD_A 1
  JZ __c_eq24
  LOAD_A 0
  __c_eq24:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else22
  CALL hks_freq_up
  JMP __c_endif23
  __c_else22:
  LOAD_M_A key
  LOAD_B 38
  CMP_A_B
  LOAD_A 1
  JZ __c_eq27
  LOAD_A 0
  __c_eq27:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else25
  CALL hks_sel_up
  JMP __c_endif26
  __c_else25:
  LOAD_M_A key
  LOAD_B 40
  CMP_A_B
  LOAD_A 1
  JZ __c_eq30
  LOAD_A 0
  __c_eq30:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else28
  CALL hks_sel_dn
  JMP __c_endif29
  __c_else28:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 83
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq33
  LOAD_A 0
  __c_eq33:
  LOAD_M_A key
  LOAD_B 115
  CMP_A_B
  LOAD_B 1
  JZ __c_eq34
  LOAD_B 0
  __c_eq34:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_else31
  CALL hks_save
  JMP __c_endif32
  __c_else31:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 87
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq37
  LOAD_A 0
  __c_eq37:
  LOAD_M_A key
  LOAD_B 119
  CMP_A_B
  LOAD_B 1
  JZ __c_eq38
  LOAD_B 0
  __c_eq38:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_else35
  CALL hks_bw_up
  JMP __c_endif36
  __c_else35:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 66
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq41
  LOAD_A 0
  __c_eq41:
  LOAD_M_A key
  LOAD_B 98
  CMP_A_B
  LOAD_B 1
  JZ __c_eq42
  LOAD_B 0
  __c_eq42:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_else39
  CALL hks_beam_up
  JMP __c_endif40
  __c_else39:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 80
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq45
  LOAD_A 0
  __c_eq45:
  LOAD_M_A key
  LOAD_B 112
  CMP_A_B
  LOAD_B 1
  JZ __c_eq46
  LOAD_B 0
  __c_eq46:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_endif44
  CALL hks_pol
  __c_endif44:
  __c_endif40:
  __c_endif36:
  __c_endif32:
  __c_endif29:
  __c_endif26:
  __c_endif23:
  __c_endif20:
  ; implicit return
  RET

hkp_deploy:
  LOAD_A 1
  STORE_A var_probe
  POP_A
  ; implicit return
  RET

hkp_recall:
  LOAD_A 0
  STORE_A var_probe
  POP_A
  ; implicit return
  RET

hkp_surf_scan:
  LOAD_M_A var_surf
  MOV_C_A
  LOAD_D 30
  MOV_A_C
  MOV_B_D
  ADD_A_B
  MOV_C_A
  MOV_A_B
  PUSH_A
  LOAD_A 1000
  PUSH_A
  POP_A
  CALL min
  POP_A
  POP_A
  STORE_A var_surf
  ; implicit return
  RET

hk_planet:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 68
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq49
  LOAD_A 0
  __c_eq49:
  LOAD_M_A key
  LOAD_B 100
  CMP_A_B
  LOAD_B 1
  JZ __c_eq50
  LOAD_B 0
  __c_eq50:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_else47
  CALL hkp_deploy
  JMP __c_endif48
  __c_else47:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 82
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq53
  LOAD_A 0
  __c_eq53:
  LOAD_M_A key
  LOAD_B 114
  CMP_A_B
  LOAD_B 1
  JZ __c_eq54
  LOAD_B 0
  __c_eq54:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_else51
  CALL hkp_recall
  JMP __c_endif52
  __c_else51:
  LOAD_M_A key
  MOV_C_A
  LOAD_D 83
  MOV_A_C
  MOV_B_D
  CMP_A_B
  LOAD_A 1
  JZ __c_eq57
  LOAD_A 0
  __c_eq57:
  LOAD_M_A key
  LOAD_B 115
  CMP_A_B
  LOAD_B 1
  JZ __c_eq58
  LOAD_B 0
  __c_eq58:
  POP_A
  OR_A_B
  CMP_A_B
  LOAD_B 0
  JZ __c_endif56
  CALL hkp_surf_scan
  __c_endif56:
  __c_endif52:
  __c_endif48:
  ; implicit return
  RET

handle_key:
  LOAD_M_A key
  LOAD_B 9
  CMP_A_B
  LOAD_A 1
  JZ __c_eq61
  LOAD_A 0
  __c_eq61:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif60
  LOAD_M_B var_mode
  LOAD_C 1
  MOV_A_B
  MOV_B_C
  CMP_A_B
  LOAD_A 1
  JZ __c_eq62
  LOAD_A 0
  __c_eq62:
  CMP_A_B
  JZ __c_tern_else63
  LOAD_A 0
  JMP __c_tern_end64
  __c_tern_else63:
  LOAD_A 1
  __c_tern_end64:
  STORE_A var_mode
  RET
  __c_endif60:
  LOAD_M_A key
  LOAD_B 27
  CMP_A_B
  LOAD_A 1
  JZ __c_eq67
  LOAD_A 0
  __c_eq67:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif66
  LOAD_A 0
  PUSH_A
  POP_A
  CALL _sys_exit
  POP_A
  RET
  __c_endif66:
  LOAD_M_A key
  LOAD_B 13
  CMP_A_B
  LOAD_A 1
  JZ __c_eq70
  LOAD_A 0
  __c_eq70:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif69
  LOAD_M_A var_prog
  MOV_C_A
  LOAD_D 20
  MOV_A_C
  MOV_B_D
  ADD_A_B
  MOV_C_A
  MOV_A_B
  PUSH_A
  LOAD_A 1000
  PUSH_A
  POP_A
  CALL min
  POP_A
  POP_A
  STORE_A var_prog
  LOAD_A 1
  STORE_A var_scan
  POP_A
  RET
  __c_endif69:
  LOAD_M_A var_mode
  LOAD_B 1
  CMP_A_B
  LOAD_A 1
  JZ __c_eq73
  LOAD_A 0
  __c_eq73:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_else71
  LOAD_M_A key
  PUSH_A
  POP_A
  CALL hk_planet
  POP_A
  JMP __c_endif72
  __c_else71:
  LOAD_M_A key
  PUSH_A
  POP_A
  CALL hk_scanner
  POP_A
  __c_endif72:
  ; implicit return
  RET

main:
  ; reserve 4 bytes for locals
  PUSH_A
  LOAD_A 0
  STORE_A var_mode
  POP_A
  LOAD_A 0
  STORE_A var_sel
  POP_A
  LOAD_A 0
  STORE_A var_scan
  POP_A
  LOAD_A 0
  STORE_A var_probe
  POP_A
  LOAD_A 350
  STORE_A var_freq
  POP_A
  LOAD_A 120
  STORE_A var_bw
  POP_A
  LOAD_A 0
  STORE_A var_bearing
  POP_A
  LOAD_A 42
  STORE_A var_beam
  POP_A
  LOAD_A 0
  STORE_A var_pol
  POP_A
  LOAD_A 85
  STORE_A var_rx
  POP_A
  LOAD_A 60
  STORE_A var_tx
  POP_A
  LOAD_A 0
  STORE_A var_prog
  POP_A
  LOAD_A 0
  STORE_A var_surf
  POP_A
  LOAD_A 0
  PUSH_A
  POP_A
  CALL _sys_tty_mode
  POP_A
  LOAD_A 0
  PUSH_A
  POP_A
  LOAD_A 14149887
  PUSH_A
  POP_A
  CALL _sys_tty_color
  POP_A
  POP_A
  __c_loop74:
  LOAD_A 1
  CMP_A_B
  LOAD_B 0
  JZ __c_wend75
  LOAD_A 0
  PUSH_A
  CALL draw_screen
  CALL _sys_input_key
  STORE_A key
  POP_A
  LOAD_M_A key
  LOAD_B 0
  CMP_A_B
  LOAD_A 1
  JNZ __c_ne78
  LOAD_A 0
  __c_ne78:
  POP_A
  CMP_A_B
  LOAD_B 0
  JZ __c_endif77
  LOAD_M_A key
  PUSH_A
  POP_A
  CALL handle_key
  POP_A
  __c_endif77:
  CALL _sys_yield
  JMP __c_loop74
  __c_wend75:
  LOAD_A 0
  RET
  ; implicit return
  POP_A
  RET

.DATA
__c_str0: .string "SCANOS v4.0 :: SYSTEM SCANNER (C)"
__c_str1: .string "SCANOS v4.0 :: PLANETARY SURVEY"
__c_str2: .string "TARGETS:"
__c_str3: .string "[Tab]planet [Enter]scan [S]save [Esc]exit"
__c_str4: .string "[Tab]scanner [D]eploy [S]can [B]ack"
__c_str5: .string "Freq: "
__c_str6: .string "  BW: "
__c_str7: .string "Beam: "
__c_str8: .string "  Pol: "
__c_str9: .string "SIGNAL: "
__c_str10: .string " MHz "
__c_str11: .string " deg "
__c_str12: .string "\n"
__c_str13: .string "########"
__c_str14: .string "####----"
__c_str15: .string "#-------"
__c_str16: .string "PLANETARY DATA:"
__c_str17: .string "Planet III / Rocky-Temperate"
__c_str18: .string "Survey: 42%  Atmosphere: N2+O2"
__c_str19: .string "Temp: -12..+18C  Press: 0.8atm"
__c_str20: .string "Minerals: Fe/Ni/Quartz  Life: ?"
__c_str21: .string "PROBE: Survey Mk1  Int:100% Bat:87%"
__c_str22: .string "Link: Stable  Cache: 18/64 GB"
__c_str23: .string "SURFACE: "
__c_str24: .string "MAP: . . * * . A . . * . . B ."
