; =============================================================================
; switch.asm — Self-hosted TUI управления коммутатором v2.1
; =============================================================================
; Текстовый интерфейс для настройки коммутатора. Только assembly + сисколлы.
;
; Экраны: 0=list, 1=config, 2=leases
; Управление: стрелки ↑↓ Enter Esc, D/N/V для toggle/config
;
; Сисколлы: SYS_NET_INFO (0x56), SYS_TTY_WRITE (0x41), SYS_INPUT_KEY (0x70)
; =============================================================================
.protected
.export main

; ─── Константы ───────────────────────────────────────────────────────────────
.equ KEY_UP, 38
.equ KEY_DOWN, 40
.equ KEY_ENTER, 13
.equ KEY_ESC, 27
.equ KEY_D, 68
.equ KEY_d, 100
.equ KEY_N, 78
.equ KEY_n, 110
.equ KEY_V, 86
.equ KEY_v, 118
.equ NET_KIND_SWITCH, 2

; ─── Строки ──────────────────────────────────────────────────────────────────
.org 8000
s_title:     .string "COMMUTATOR CONTROL v2.1\n"
s_list_hdr:  .string "Switches on network:\n"
s_no_sw:     .string "No switches found.\n"
s_sel:       .string " > "
s_nosel:     .string "   "
s_pw_yes:    .string "YES\n"
s_pw_no:     .string "NO\n"
s_help0:     .string "[Up/Down] select  [Enter] open  [Esc] exit\n"
s_cfg_hdr:   .string " Configuration:\n"
s_dhcp_on:   .string "[D] DHCP: ON\n"
s_dhcp_off:  .string "[D] DHCP: OFF\n"
s_dns_on:    .string "[N] DNS:  ON\n"
s_dns_off:   .string "[N] DNS:  OFF\n"
s_help1:     .string "[D] DHCP [N] DNS [V] leases [Esc] back\n"
s_leases_hdr:.string "DHCP LEASES:\n"
s_no_leases: .string "No active leases.\n"
s_nl:        .string "\n"
s_label_ports: .string " ports="
s_label_pwr:   .string " pwr="
s_label_mac:   .string " mac=xx:xx:xx:xx:xx:xx\n"

; ─── Переменные ──────────────────────────────────────────────────────────────
.org 8600
var_selected: .zero 1    ; u8: текущий индекс в списке
var_state:    .zero 1    ; u8: 0=list, 1=config, 2=leases
var_count:    .zero 1    ; u8: количество коммутаторов
var_dhcp:     .zero 1    ; u8: DHCP ON=1
var_dns:      .zero 1    ; u8: DNS ON=1

; ─── Буферы ──────────────────────────────────────────────────────────────────
.org 8700
net_buf: .zero 256       ; SYS_NET_INFO
tmp_buf: .zero 64        ; scratch

; ─── main ─────────────────────────────────────────────────────────────────────
main:
  ; Текстовый режим
  LOAD_A 0
  SYSCALL 0x42
  LOAD_A 0xd7e8ff
  LOAD_B 0x000000
  SYSCALL 0x44
  ; Инициализация
  LOAD_A 0
  STORE_A var_selected
  STORE_A var_state
  STORE_A var_count
  LOAD_A 1
  STORE_A var_dhcp
  STORE_A var_dns
  ; Основной цикл
main_loop:
  CALL draw_screen
  ; Ждём клавишу
  SYSCALL 0x70              ; INPUT_KEY → A
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
  LOAD_M_A var_state
  LOAD_D 0
  CMP_A_D
  JZ draw_list
  LOAD_D 1
  CMP_A_D
  JZ draw_config
  JMP draw_leases

; ─── Список ──────────────────────────────────────────────────────────────────
draw_list:
  LOAD_B s_title
  LOAD_C 24
  SYSCALL 0x41
  ; запрос устройств
  LOAD_A 0x56
  LOAD_B net_buf
  LOAD_C 256
  SYSCALL 0x8e
  MOV_A_D
  LOAD_D 0
  CMP_A_D
  JZ draw_list_empty
  ; Заголовок
  LOAD_B s_list_hdr
  LOAD_C 21
  SYSCALL 0x41
  ; Упрощение: всегда показываем одно устройство
  LOAD_M_A var_selected
  LOAD_D 0
  CMP_A_D
  JZ dl_sel_yes
  LOAD_B s_nosel
  JMP dl_mac
dl_sel_yes:
  LOAD_B s_sel
dl_mac:
  LOAD_C 3
  SYSCALL 0x41
  ; Выводим "switch mac=..."
  LOAD_B s_label_mac
  LOAD_C 26
  SYSCALL 0x41
  ; Подсказка
  LOAD_B s_help0
  LOAD_C 45
  SYSCALL 0x41
  RET

draw_list_empty:
  LOAD_B s_no_sw
  LOAD_C 22
  SYSCALL 0x41
  RET

; ─── Конфигурация ────────────────────────────────────────────────────────────
draw_config:
  LOAD_B s_title
  LOAD_C 24
  SYSCALL 0x41
  LOAD_B s_cfg_hdr
  LOAD_C 16
  SYSCALL 0x41
  ; DHCP
  LOAD_M_A var_dhcp
  LOAD_D 0
  CMP_A_D
  JZ dc_dhcp_off
  LOAD_B s_dhcp_on
  JMP dc_dhcp_done
dc_dhcp_off:
  LOAD_B s_dhcp_off
dc_dhcp_done:
  LOAD_C 15
  SYSCALL 0x41
  ; DNS
  LOAD_M_A var_dns
  LOAD_D 0
  CMP_A_D
  JZ dc_dns_off
  LOAD_B s_dns_on
  JMP dc_dns_done
dc_dns_off:
  LOAD_B s_dns_off
dc_dns_done:
  LOAD_C 14
  SYSCALL 0x41
  ; Подсказка
  LOAD_B s_help1
  LOAD_C 48
  SYSCALL 0x41
  RET

; ─── Leases ──────────────────────────────────────────────────────────────────
draw_leases:
  LOAD_B s_leases_hdr
  LOAD_C 14
  SYSCALL 0x41
  LOAD_B s_no_leases
  LOAD_C 19
  SYSCALL 0x41
  LOAD_B s_help1
  LOAD_C 48
  SYSCALL 0x41
  RET

; =============================================================================
; handle_key
; =============================================================================
handle_key:
  MOV_A_D                   ; D = keycode
  ; Esc — специальная обработка
  LOAD_D KEY_ESC
  CMP_A_D
  JZ hk_esc
  ; dispatch по state
  LOAD_M_A var_state
  LOAD_D 0
  CMP_A_D
  JZ hk_list
  LOAD_D 1
  CMP_A_D
  JZ hk_config
  JMP hk_leases

hk_esc:
  LOAD_M_A var_state
  LOAD_D 0
  CMP_A_D
  JZ switch_exit             ; из списка — выход
  LOAD_A 0
  STORE_A var_state          ; назад к списку
  RET

hk_list:
  MOV_A_D
  LOAD_D KEY_UP
  CMP_A_D
  JZ hk_list_up
  LOAD_D KEY_DOWN
  CMP_A_D
  JZ hk_list_dn
  LOAD_D KEY_ENTER
  CMP_A_D
  JZ hk_list_open
  RET

hk_list_up:
  LOAD_M_A var_selected
  LOAD_D 0
  CMP_A_D
  JZ hk_list_up_end
  DEC_A
  STORE_A var_selected
hk_list_up_end:
  RET

hk_list_dn:
  LOAD_M_A var_selected
  INC_A
  STORE_A var_selected
  RET

hk_list_open:
  LOAD_A 1
  STORE_A var_state
  RET

hk_config:
  MOV_A_D
  LOAD_D KEY_D
  CMP_A_D
  JZ hk_cfg_dhcp
  LOAD_D KEY_d
  CMP_A_D
  JZ hk_cfg_dhcp
  LOAD_D KEY_N
  CMP_A_D
  JZ hk_cfg_dns
  LOAD_D KEY_n
  CMP_A_D
  JZ hk_cfg_dns
  LOAD_D KEY_V
  CMP_A_D
  JZ hk_cfg_leases
  LOAD_D KEY_v
  CMP_A_D
  JZ hk_cfg_leases
  RET

hk_cfg_dhcp:
  LOAD_M_A var_dhcp
  LOAD_D 0
  CMP_A_D
  JZ hk_dhcp_on
  LOAD_A 0
  JMP hk_dhcp_set
hk_dhcp_on:
  LOAD_A 1
hk_dhcp_set:
  STORE_A var_dhcp
  RET

hk_cfg_dns:
  LOAD_M_A var_dns
  LOAD_D 0
  CMP_A_D
  JZ hk_dns_on
  LOAD_A 0
  JMP hk_dns_set
hk_dns_on:
  LOAD_A 1
hk_dns_set:
  STORE_A var_dns
  RET

hk_cfg_leases:
  LOAD_A 2
  STORE_A var_state
  RET

hk_leases:
  LOAD_A 1
  STORE_A var_state
  RET

switch_exit:
  LOAD_A 0
  RET