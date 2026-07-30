; =============================================================================
; net-buf.asm — Экспорт констант сетевых буферов для ядра PCOS.
; =============================================================================
; Сами буферы реализованы в JS (src/game/net-buf.js) для эффективности.
; Ядро assembly обращается к ним через сисколлы SYS_NET_SEND/SYS_NET_RECV.
; Этот файл предоставляет символические константы для использования в
; других модулях ядра (net.asm, driver-*.asm).
; =============================================================================
.include "include/syscall.inc"

; ─── Константы буфера ────────────────────────────────────────────────────────
; Размеры для выделения памяти в user space под буферы приёма/передачи
.equ NET_BUF_SIZE, 512        ; окно данных одного буфера (байт)
.equ NET_BUF_HEADER, 12       ; размер заголовка буфера (зарезервировано)
.equ NET_BUF_TOTAL, 524       ; NET_BUF_SIZE + NET_BUF_HEADER
.equ NET_MAX_FRAME, 256       ; максимальная длина одного Ethernet-фрейма
.equ NET_FRAME_HEADER, 2      ; заголовок фрейма: u16 length (в user-буфере)

; ─── Максимальное число сетевых устройств ────────────────────────────────────
.equ NET_MAX_DEVICES, 8       ; максимум сетевых интерфейсов на корабле

; ─── Команды NET_DEVICE_IO ───────────────────────────────────────────────────
.equ NET_CMD_STATUS, 1        ; запрос статуса устройства
.equ NET_CMD_SCAN, 2          ; команда сканирования (scanner)
.equ NET_CMD_DHCP_CONFIG, 3   ; конфигурация DHCP (switch)
.equ NET_CMD_DNS_CONFIG, 4    ; конфигурация DNS (switch)

; ─── Типы устройств (kind) в NET_INFO ────────────────────────────────────────
.equ NET_KIND_COMPUTER, 1     ; компьютер с NIC
.equ NET_KIND_SWITCH, 2       ; коммутатор
.equ NET_KIND_SCANNER, 3      ; сканер
.equ NET_KIND_ANTENNA, 4      ; антенна
.equ NET_KIND_WEAPON, 5       ; оружие
.equ NET_KIND_ENGINE, 6       ; двигатель
.equ NET_KIND_GYRO, 7         ; гироскоп

; ─── Экспорт (символы доступны для других модулей) ───────────────────────────
.export NET_BUF_SIZE
.export NET_BUF_HEADER
.export NET_BUF_TOTAL
.export NET_MAX_FRAME
.export NET_FRAME_HEADER
.export NET_MAX_DEVICES
.export NET_CMD_STATUS
.export NET_CMD_SCAN
.export NET_CMD_DHCP_CONFIG
.export NET_CMD_DNS_CONFIG
.export NET_KIND_COMPUTER
.export NET_KIND_SWITCH
.export NET_KIND_SCANNER
.export NET_KIND_ANTENNA