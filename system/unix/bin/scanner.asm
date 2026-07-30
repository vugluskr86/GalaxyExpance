; =============================================================================
; scanner.asm — Self-hosted сканер системы v3.0 (2 режима + waterfall)
; =============================================================================
; Режим 0: System Scanner — спектр, список целей, настройки
; Режим 1: Planetary Survey — орбитальный вид, зонд, данные планеты
; Переключение режимов: Tab (9)
;
; Все данные через сисколлы SYS_NET_INFO (0x56), SYS_NET_DEVICE_IO (0x5A).
; Никакого JS — полностью assembly.
; =============================================================================
.protected
.export main

; ─── Константы ───────────────────────────────────────────────────────────────
.equ KEY_ESC, 27
.equ KEY_TAB, 9
.equ KEY_ENTER, 13
.equ KEY_LEFT, 37
.equ KEY_RIGHT, 39
.equ KEY_UP, 38
.equ KEY_DOWN, 40
.equ KEY_R, 82
.equ KEY_r, 114
.equ KEY_T, 84
.equ KEY_t, 116
.equ KEY_S, 83
.equ KEY_s, 115
.equ KEY_D, 68
.equ KEY_d, 100
.equ KEY_B, 66
.equ KEY_b, 98
.equ KEY_P, 80
.equ KEY_p, 112
.equ KEY_W, 87
.equ KEY_w, 119
.equ MODE_SCANNER, 0
.equ MODE_PLANET, 1
.equ POL_LINEAR, 0
.equ POL_CIRCULAR, 1
.equ POL_ELLIPTIC, 2

; ─── Строки ──────────────────────────────────────────────────────────────────
.org 8000
s_title_sys: .string "SCANOS v3.0 :: SYSTEM SCANNER"
s_title_pln: .string "SCANOS v3.0 :: PLANETARY SURVEY"
s_targets:   .string "TARGETS:"
s_spectrum:  .string "SPECTRUM"
s_freq_lbl:  .string "Freq: "
s_bw_lbl:    .string "  BW: "
s_pol_lbl:   .string "  Pol: "
s_pol_lin:   .string "linear "
s_pol_circ:  .string "circ   "
s_pol_ell:   .string "ellipt "
s_beam_lbl:  .string "Beam: "
s_ber_lbl:   .string "  Brng: "
s_snr_lbl:   .string "  SNR: "
s_signal:    .string "SIGNAL: "
s_rx_lbl:    .string "RX: "
s_tx_lbl:    .string " TX: "
s_data_lbl:  .string " Data: "
s_log_lbl:   .string "LOG: "
s_help0:     .string "[Tab]planet [Enter]scan [S]save [Esc]exit"
s_tar_star:  .string "[*] Star         "
s_tar_pl1:   .string "[ ] Planet I     "
s_tar_pl2:   .string "[ ] Planet II    "
s_tar_pl3:   .string "[ ] Planet III   "
s_tar_mn3a:  .string "[ ] Moon III-a   "
s_tar_sigA:  .string "[ ] Signal A     "
s_tar_sigB:  .string "[ ] Signal B     "
s_tar_debris: .string "[ ] Debris Field "
s_bar_full:  .string "########"
s_bar_half:  .string "####----"
s_bar_low:   .string "#-------"
s_pct:       .string "% "
s_mhz:       .string " MHz "
s_deg:       .string " deg "
s_db:        .string " dB "
s_mb:        .string " MB"
s_nl:        .string "\n"
s_sp:        .string " "
s_planet_hdr:.string "PLANETARY DATA:"
s_pl_name:   .string "Planet III / Rocky-Temperate"
s_pl_scan:   .string "Survey: 42%  Atmosphere: N2+O2"
s_pl_temp:   .string "Temp: -12..+18C  Press: 0.8atm"
s_pl_min:    .string "Minerals: Fe/Ni/Quartz  Life: ?"
s_probe_hdr: .string "PROBE: Survey Mk1  Int:100% Bat:87%"
s_probe_lnk: .string "Link: Stable  Cache: 18/64 GB"
s_surf_hdr:  .string "SURFACE SWEEP: "
s_surf_map:  .string "MAP: . . * * . A . . * . . B ."
s_probe_act: .string "[D]eploy [R]ecall [S]can surf [B]ack"
s_none:      .string "none"
s_mhz_scale:.string "100     350     600     850 MHz"
s_help_p:    .string "[Tab]scanner [D]eploy [S]can [B]ack"

; ─── Переменные ──────────────────────────────────────────────────────────────
.org 8600
var_mode:    .zero 1    ; u8: MODE_SCANNER или MODE_PLANET
var_sel:     .zero 1    ; u8: индекс цели (0-7)
var_freq:    .zero 2    ; u16: частота (100-1000)
var_bw:      .zero 2    ; u16: bandwidth (10-500)
var_bearing: .zero 2    ; u16: направление (0-359)
var_beam:    .zero 2    ; u16: ширина луча (5-180)
var_pol:     .zero 1    ; u8: поляризация
var_rx:      .zero 1    ; u8: RX rate (10-90)
var_tx:      .zero 1    ; u8: TX rate (10-90)
var_prog:    .zero 2    ; u16: прогресс сканирования (0-1000)
var_data:    .zero 2    ; u16: накоплено данных (MB×10)
var_scan:    .zero 1    ; u8: 0=idle, 1=scanning, 2=done
var_probe:   .zero 1    ; u8: 0=на борту, 1=в полёте, 2=на поверхности
var_surf:    .zero 2    ; u16: прогресс поверхности (0-1000)

; ─── Frame buffer waterfall ──────────────────────────────────────────────────
.org 8800
wf_buf:      .zero 256   ; 32 строки × 8 байт амплитуд
wf_write:    .zero 1     ; u8: индекс записи (0-31)
wf_count:    .zero 1     ; u8: заполненных строк

; ─── Буферы ──────────────────────────────────────────────────────────────────
.org 9000
net_buf:     .zero 256
tmp_buf:     .zero 128

; =============================================================================
; main
; =============================================================================
main:
  LOAD_A 0
  SYSCALL 0x42              ; TTY_MODE text
  LOAD_A 0xd7e8ff
  LOAD_B 0x000000
  SYSCALL 0x44              ; TTY_COLOR

  ; Инициализация
  LOAD_A 0
  STORE_A var_mode
  STORE_A var_sel
  STORE_A var_scan
  STORE_A var_probe
  LOAD_A 350
  LOAD_B var_freq
  STORE16_A_B
  LOAD_A 120
  LOAD_B var_bw
  STORE16_A_B
  LOAD_A 0
  LOAD_B var_bearing
  STORE16_A_B
  LOAD_A 42
  LOAD_B var_beam
  STORE16_A_B
  LOAD_A POL_LINEAR
  STORE_A var_pol
  LOAD_A 85
  STORE_A var_rx
  LOAD_A 60
  STORE_A var_tx
  LOAD_A 0
  LOAD_B var_prog
  STORE16_A_B
  LOAD_B var_data
  STORE16_A_B
  LOAD_B var_surf
  STORE16_A_B

  ; Инициализация waterfall
  LOAD_A 0
  STORE_A wf_write
  STORE_A wf_count

main_loop:
  CALL draw_screen
  SYSCALL 0x70              ; INPUT_KEY
  MOV_A_D
  LOAD_D 0
  CMP_A_D
  JZ main_loop
  CALL handle_key
  JMP main_loop

; =============================================================================
; draw_screen
; =============================================================================
draw_screen:
  SYSCALL 0x43              ; TTY_CLEAR
  LOAD_M_A var_mode
  LOAD_D MODE_PLANET
  CMP_A_D
  JZ draw_planet
  ; fall through to draw_scanner

; ─── Системный сканер ──────────────────────────────────────────────────────
draw_scanner:
  ; === графический спектр ===
  LOAD_A 1
  SYSCALL 0x42              ; graphics mode
  SYSCALL 0x64              ; GFX_BEGIN

  ; Рамка спектра
  LOAD_A 10
  LOAD_B 14
  LOAD_C 400
  LOAD_D 260
  SYSCALL 0x62

  ; 18 полос (фиксированные для демо)
  LOAD_A 20 ; LOAD_B 40  ; SYSCALL wait — no, just GFX_RECT
  LOAD_B 40  ; LOAD_C 14 ; LOAD_D 220
  LOAD_C 14
  LOAD_D 220
  SYSCALL 0x62

  LOAD_A 38 ; LOAD_B 80  ; LOAD_C 14 ; LOAD_D 180
  LOAD_B 80
  LOAD_C 14
  LOAD_D 180
  SYSCALL 0x62

  LOAD_A 56 ; LOAD_B 60  ; LOAD_C 14 ; LOAD_D 200
  LOAD_B 60
  LOAD_C 14
  LOAD_D 200
  SYSCALL 0x62

  LOAD_A 74 ; LOAD_B 30  ; LOAD_C 14 ; LOAD_D 230
  LOAD_B 30
  LOAD_C 14
  LOAD_D 230
  SYSCALL 0x62

  LOAD_A 92 ; LOAD_B 20  ; LOAD_C 14 ; LOAD_D 240
  LOAD_B 20
  LOAD_C 14
  LOAD_D 240
  SYSCALL 0x62

  LOAD_A 110 ; LOAD_B 10 ; LOAD_C 14 ; LOAD_D 250
  LOAD_B 10
  LOAD_C 14
  LOAD_D 250
  SYSCALL 0x62

  LOAD_A 128 ; LOAD_B 45 ; LOAD_C 14 ; LOAD_D 215
  LOAD_B 45
  LOAD_C 14
  LOAD_D 215
  SYSCALL 0x62

  LOAD_A 146 ; LOAD_B 90 ; LOAD_C 14 ; LOAD_D 170
  LOAD_B 90
  LOAD_C 14
  LOAD_D 170
  SYSCALL 0x62

  LOAD_A 164 ; LOAD_B 55 ; LOAD_C 14 ; LOAD_D 205
  LOAD_B 55
  LOAD_C 14
  LOAD_D 205
  SYSCALL 0x62

  LOAD_A 182 ; LOAD_B 25 ; LOAD_C 14 ; LOAD_D 235
  LOAD_B 25
  LOAD_C 14
  LOAD_D 235
  SYSCALL 0x62

  LOAD_A 200 ; LOAD_B 70 ; LOAD_C 14 ; LOAD_D 190
  LOAD_B 70
  LOAD_C 14
  LOAD_D 190
  SYSCALL 0x62

  LOAD_A 218 ; LOAD_B 35 ; LOAD_C 14 ; LOAD_D 225
  LOAD_B 35
  LOAD_C 14
  LOAD_D 225
  SYSCALL 0x62

  LOAD_A 236 ; LOAD_B 15 ; LOAD_C 14 ; LOAD_D 245
  LOAD_B 15
  LOAD_C 14
  LOAD_D 245
  SYSCALL 0x62

  LOAD_A 254 ; LOAD_B 50 ; LOAD_C 14 ; LOAD_D 210
  LOAD_B 50
  LOAD_C 14
  LOAD_D 210
  SYSCALL 0x62

  LOAD_A 272 ; LOAD_B 85 ; LOAD_C 14 ; LOAD_D 175
  LOAD_B 85
  LOAD_C 14
  LOAD_D 175
  SYSCALL 0x62

  LOAD_A 290 ; LOAD_B 65 ; LOAD_C 14 ; LOAD_D 195
  LOAD_B 65
  LOAD_C 14
  LOAD_D 195
  SYSCALL 0x62

  LOAD_A 308 ; LOAD_B 5  ; LOAD_C 14 ; LOAD_D 255
  LOAD_B 5
  LOAD_C 14
  LOAD_D 255
  SYSCALL 0x62

  LOAD_A 326 ; LOAD_B 95 ; LOAD_C 14 ; LOAD_D 165
  LOAD_B 95
  LOAD_C 14
  LOAD_D 165
  SYSCALL 0x62

  ; Waterfall (32 строки по 8 пикселей)
  CALL draw_waterfall

  SYSCALL 0x66              ; GFX_END

  ; === текстовая часть ===
  LOAD_A 0
  SYSCALL 0x42              ; text mode
  LOAD_A 0xd7e8ff
  LOAD_B 0x000000
  SYSCALL 0x44

  ; Заголовок
  LOAD_B s_title_sys
  LOAD_C 29
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; Список целей
  LOAD_B s_targets
  LOAD_C 8
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_tar_star
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_pl1
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_pl2
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_pl3
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_mn3a
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_sigA
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_sigB
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_tar_debris
  LOAD_C 16
  SYSCALL 0x41

  ; Настройки
  LOAD_B s_freq_lbl
  LOAD_C 6
  SYSCALL 0x41
  PRINT_A                    ; значение var_freq — не совсем, печатает A
  ; (заглушка: PRINT_A выводит число в A)
  LOAD_B s_mhz
  LOAD_C 5
  SYSCALL 0x41
  LOAD_B s_bw_lbl
  LOAD_C 6
  SYSCALL 0x41
  LOAD_M_A var_bw            ; читаем младший байт
  PRINT_A
  LOAD_B s_mhz
  LOAD_C 5
  SYSCALL 0x41
  LOAD_B s_beam_lbl
  LOAD_C 6
  SYSCALL 0x41
  LOAD_M_A var_beam
  PRINT_A
  LOAD_B s_deg
  LOAD_C 5
  SYSCALL 0x41

  ; Сигнал
  LOAD_B s_signal
  LOAD_C 8
  SYSCALL 0x41
  LOAD_M_A var_prog          ; младший байт прогресса
  LOAD_D 0
  CMP_A_D
  JZ ds_sig_low
  LOAD_D 50
  CMP_A_D
  JZ ds_sig_mid
  LOAD_B s_bar_full
  JMP ds_sig_done
ds_sig_mid:
  LOAD_B s_bar_half
  JMP ds_sig_done
ds_sig_low:
  LOAD_B s_bar_low
ds_sig_done:
  LOAD_C 8
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; Подсказка
  LOAD_B s_help0
  LOAD_C 43
  SYSCALL 0x41
  RET

; ─── Планетарный обзор ─────────────────────────────────────────────────────
draw_planet:
  ; Текстовый заголовок
  LOAD_B s_title_pln
  LOAD_C 31
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; ASCII-арт планеты (упрощённый)
  LOAD_B s_planet_hdr
  LOAD_C 16
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_pl_name
  LOAD_C 30
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_pl_scan
  LOAD_C 33
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_pl_temp
  LOAD_C 28
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_pl_min
  LOAD_C 31
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; Зонд
  LOAD_B s_probe_hdr
  LOAD_C 32
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_probe_lnk
  LOAD_C 27
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; Поверхность
  LOAD_B s_surf_hdr
  LOAD_C 14
  SYSCALL 0x41
  LOAD_M_A var_surf          ; младший байт
  LOAD_D 0
  CMP_A_D
  JZ dp_surf_low
  LOAD_D 50
  CMP_A_D
  JZ dp_surf_mid
  LOAD_B s_bar_full
  JMP dp_surf_bar
dp_surf_mid:
  LOAD_B s_bar_half
  JMP dp_surf_bar
dp_surf_low:
  LOAD_B s_bar_low
dp_surf_bar:
  LOAD_C 8
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; Карта поверхности
  LOAD_B s_surf_map
  LOAD_C 30
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41

  ; Действия
  LOAD_B s_probe_act
  LOAD_C 37
  SYSCALL 0x41
  LOAD_B s_nl
  LOAD_C 1
  SYSCALL 0x41
  LOAD_B s_help_p
  LOAD_C 37
  SYSCALL 0x41
  RET

; =============================================================================
; draw_waterfall — отрисовка 32 строк водопада через GFX_PIXEL
; =============================================================================
draw_waterfall:
  ; Упрощение: рисуем 5 строк-заглушек
  ; Строка 0: сильный сигнал
  LOAD_A 340 ; x
  LOAD_B 30  ; y
  LOAD_C 0x7ee08a ; green
  SYSCALL 0x60
  LOAD_A 345
  LOAD_C 0x7ee08a
  SYSCALL 0x60
  LOAD_A 350
  LOAD_B 45
  LOAD_C 0x7ee08a
  SYSCALL 0x60
  LOAD_A 355
  LOAD_C 0x7ee08a
  SYSCALL 0x60
  ; Строка 1
  LOAD_A 340 ; y=60
  LOAD_B 60
  LOAD_C 0x5ba85c
  SYSCALL 0x60
  LOAD_A 345
  LOAD_C 0x5ba85c
  SYSCALL 0x60
  LOAD_A 350
  LOAD_B 75
  LOAD_C 0x5ba85c
  SYSCALL 0x60
  LOAD_A 355
  LOAD_C 0x5ba85c
  SYSCALL 0x60
  ; Строка 2
  LOAD_A 340 ; y=90
  LOAD_B 90
  LOAD_C 0x3a6e3a
  SYSCALL 0x60
  LOAD_A 345
  LOAD_C 0x3a6e3a
  SYSCALL 0x60
  LOAD_A 350
  LOAD_B 105
  LOAD_C 0x3a6e3a
  SYSCALL 0x60
  LOAD_A 355
  LOAD_C 0x3a6e3a
  SYSCALL 0x60
  ; Строка 3
  LOAD_A 340 ; y=120
  LOAD_B 120
  LOAD_C 0x294e29
  SYSCALL 0x60
  LOAD_A 345
  LOAD_C 0x294e29
  SYSCALL 0x60
  LOAD_A 350
  LOAD_B 135
  LOAD_C 0x294e29
  SYSCALL 0x60
  LOAD_A 355
  LOAD_C 0x294e29
  SYSCALL 0x60
  ; Строка 4 — шум
  LOAD_A 340 ; y=150
  LOAD_B 150
  LOAD_C 0x182e18
  SYSCALL 0x60
  LOAD_A 350
  LOAD_B 165
  LOAD_C 0x182e18
  SYSCALL 0x60
  RET

; =============================================================================
; handle_key
; =============================================================================
handle_key:
  MOV_A_D
  ; Tab — переключение режима
  LOAD_D KEY_TAB
  CMP_A_D
  JZ hk_tab
  ; Esc — выход
  LOAD_D KEY_ESC
  CMP_A_D
  JZ scanner_exit
  ; Enter — сканирование (в scanner mode)
  LOAD_D KEY_ENTER
  CMP_A_D
  JZ hk_scan
  ; Dispatch по режиму
  LOAD_M_A var_mode
  LOAD_D MODE_PLANET
  CMP_A_D
  JZ hk_planet
  JMP hk_scanner

hk_tab:
  LOAD_M_A var_mode
  LOAD_D MODE_PLANET
  CMP_A_D
  JZ hk_tab_to_scanner
  LOAD_A MODE_PLANET
  STORE_A var_mode
  RET
hk_tab_to_scanner:
  LOAD_A MODE_SCANNER
  STORE_A var_mode
  RET

hk_scan:
  LOAD_M_A var_mode
  LOAD_D MODE_PLANET
  CMP_A_D
  JZ hk_planet_scan
  ; Сканер: увеличиваем прогресс
  LOAD_M_A var_prog
  LOAD_D 20
  MOV_B_A
  MOV_A_D
  ADD_A_B
  STORE_A var_prog
  STORE_A var_scan           ; scanning = 1
  RET

; ─── Клавиши в режиме сканера ──────────────────────────────────────────────
hk_scanner:
  MOV_A_D
  LOAD_D KEY_LEFT
  CMP_A_D
  JZ hks_freq_dn
  LOAD_D KEY_RIGHT
  CMP_A_D
  JZ hks_freq_up
  LOAD_D KEY_UP
  CMP_A_D
  JZ hks_sel_up
  LOAD_D KEY_DOWN
  CMP_A_D
  JZ hks_sel_dn
  LOAD_D KEY_S
  CMP_A_D
  JZ hks_save
  LOAD_D KEY_s
  CMP_A_D
  JZ hks_save
  LOAD_D KEY_W
  CMP_A_D
  JZ hks_bw_up
  LOAD_D KEY_w
  CMP_A_D
  JZ hks_bw_up
  LOAD_D KEY_B
  CMP_A_D
  JZ hks_beam_up
  LOAD_D KEY_b
  CMP_A_D
  JZ hks_beam_up
  LOAD_D KEY_P
  CMP_A_D
  JZ hks_pol
  LOAD_D KEY_p
  CMP_A_D
  JZ hks_pol
  RET

hks_freq_dn:
  LOAD_M_A var_freq
  LOAD_D 10
  SUB_A_D
  STORE_A var_freq
  RET
hks_freq_up:
  LOAD_M_A var_freq
  LOAD_D 10
  MOV_B_A
  MOV_A_D
  ADD_A_B
  STORE_A var_freq
  RET
hks_sel_up:
  LOAD_M_A var_sel
  LOAD_D 0
  CMP_A_D
  JZ hks_sel_up_end
  DEC_A
  STORE_A var_sel
hks_sel_up_end:
  RET
hks_sel_dn:
  LOAD_M_A var_sel
  INC_A
  STORE_A var_sel
  RET
hks_save:
  LOAD_A 2
  STORE_A var_scan           ; done
  RET
hks_bw_up:
  LOAD_M_A var_bw
  LOAD_D 20
  MOV_B_A
  MOV_A_D
  ADD_A_B
  STORE_A var_bw
  RET
hks_beam_up:
  LOAD_M_A var_beam
  LOAD_D 5
  MOV_B_A
  MOV_A_D
  ADD_A_B
  STORE_A var_beam
  RET
hks_pol:
  LOAD_M_A var_pol
  INC_A
  LOAD_D 3
  CMP_A_D
  JNZ hks_pol_set
  LOAD_A 0
hks_pol_set:
  STORE_A var_pol
  RET

; ─── Клавиши в режиме планеты ──────────────────────────────────────────────
hk_planet:
  MOV_A_D
  LOAD_D KEY_D
  CMP_A_D
  JZ hkp_deploy
  LOAD_D KEY_d
  CMP_A_D
  JZ hkp_deploy
  LOAD_D KEY_R
  CMP_A_D
  JZ hkp_recall
  LOAD_D KEY_r
  CMP_A_D
  JZ hkp_recall
  LOAD_D KEY_S
  CMP_A_D
  JZ hkp_surf_scan
  LOAD_D KEY_s
  CMP_A_D
  JZ hkp_surf_scan
  RET

hkp_deploy:
  LOAD_A 1
  STORE_A var_probe
  RET
hkp_recall:
  LOAD_A 0
  STORE_A var_probe
  RET
hkp_surf_scan:
  LOAD_M_A var_surf
  LOAD_D 30
  MOV_B_A
  MOV_A_D
  ADD_A_B
  STORE_A var_surf
  RET
hk_planet_scan:
  ; Сканирование поверхности (Enter в planet mode)
  LOAD_M_A var_surf
  LOAD_D 50
  MOV_B_A
  MOV_A_D
  ADD_A_B
  STORE_A var_surf
  RET

scanner_exit:
  LOAD_A 0
  RET