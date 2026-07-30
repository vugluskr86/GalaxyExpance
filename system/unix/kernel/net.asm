; =============================================================================
; net.asm — Константы протоколов ARP, IP, ICMP для ядра PCOS.
; =============================================================================
; Полноценная реализация протоколов будет в следующих этапах. Этот файл
; предоставляет константы EtherType, IP-протоколов и ARP-операций для
; использования в driver-*.asm и userspace-программах (scanner.asm, switch.asm).
; =============================================================================
.include "include/syscall.inc"
.include "kernel/net-buf.asm"

; ─── EtherType (Ethernet-фрейм, смещение 12-13, big-endian) ──────────────────
.equ ETHERTYPE_IPV4, 0x0800   ; IPv4
.equ ETHERTYPE_ARP,  0x0806   ; Address Resolution Protocol

; ─── IP-протоколы (поле protocol в IP-заголовке, смещение 9) ─────────────────
.equ IP_PROTO_ICMP, 1         ; Internet Control Message Protocol
.equ IP_PROTO_TCP,  6         ; Transmission Control Protocol
.equ IP_PROTO_UDP,  17        ; User Datagram Protocol

; ─── ARP-операции ─────────────────────────────────────────────────────────────
.equ ARP_REQUEST, 1            ; кто имеет этот IP?
.equ ARP_REPLY,   2            ; вот мой MAC

; ─── Размеры заголовков ───────────────────────────────────────────────────────
.equ ETHER_HEADER_SIZE, 14     ; [dst_mac(6)][src_mac(6)][ethertype(2)]
.equ ARP_PACKET_SIZE, 28       ; [htype(2)][ptype(2)][hlen(1)][plen(1)][oper(2)][sha(6)][spa(4)][tha(6)][tpa(4)]
.equ IP_HEADER_SIZE, 20        ; без опций (IHL=5)
.equ ICMP_HEADER_SIZE, 8       ; [type(1)][code(1)][checksum(2)][id(2)][seq(2)]

; ─── Смещения в Ethernet-фрейме ───────────────────────────────────────────────
.equ ETHER_DST_OFF, 0          ; dst_mac (6 байт)
.equ ETHER_SRC_OFF, 6          ; src_mac (6 байт)
.equ ETHER_TYPE_OFF, 12        ; ethertype (2 байта, big-endian)
.equ ETHER_PAYLOAD_OFF, 14     ; начало payload

; ─── Смещения в ARP-пакете ─────────────────────────────────────────────────────
.equ ARP_HTYPE_OFF, 0          ; hardware type (2 байта, big-endian)
.equ ARP_PTYPE_OFF, 2          ; protocol type (2 байта)
.equ ARP_HLEN_OFF, 4           ; длина MAC (1 байт)
.equ ARP_PLEN_OFF, 5           ; длина IP (1 байт)
.equ ARP_OPER_OFF, 6           ; операция (2 байта, big-endian)
.equ ARP_SHA_OFF, 8            ; MAC отправителя (6 байт)
.equ ARP_SPA_OFF, 14           ; IP отправителя (4 байта)
.equ ARP_THA_OFF, 18           ; MAC получателя (6 байт)
.equ ARP_TPA_OFF, 24           ; IP получателя (4 байта)

; ─── Смещения в IP-заголовке ──────────────────────────────────────────────────
.equ IP_VER_IHL_OFF, 0         ; version(4 бита) + IHL(4 бита)
.equ IP_TOS_OFF, 1             ; Type of Service
.equ IP_TOTAL_LEN_OFF, 2       ; общая длина (2 байта, big-endian)
.equ IP_ID_OFF, 4              ; идентификатор (2 байта)
.equ IP_FLAGS_FRAG_OFF, 6      ; флаги + смещение фрагмента (2 байта)
.equ IP_TTL_OFF, 8             ; Time to Live (1 байт)
.equ IP_PROTO_OFF, 9           ; протокол (1 байт)
.equ IP_CHECKSUM_OFF, 10       ; контрольная сумма (2 байта)
.equ IP_SRC_OFF, 12            ; IP отправителя (4 байта)
.equ IP_DST_OFF, 16            ; IP получателя (4 байта)

; ─── Смещения в ICMP-пакете ───────────────────────────────────────────────────
.equ ICMP_TYPE_OFF, 0          ; тип (1 байт): 8=echo, 0=echo-reply
.equ ICMP_CODE_OFF, 1          ; код (1 байт)
.equ ICMP_CHECKSUM_OFF, 2      ; контрольная сумма (2 байта)
.equ ICMP_ID_OFF, 4            ; идентификатор (2 байта)
.equ ICMP_SEQ_OFF, 6           ; номер последовательности (2 байта)
.equ ICMP_DATA_OFF, 8          ; данные (после заголовка)

; ─── Широковещательный MAC (все FF) ───────────────────────────────────────────
; Для ARP-запросов: dst_mac = FF:FF:FF:FF:FF:FF
.equ BROADCAST_MAC_0, 0xFF
.equ BROADCAST_MAC_1, 0xFF
.equ BROADCAST_MAC_2, 0xFF
.equ BROADCAST_MAC_3, 0xFF
.equ BROADCAST_MAC_4, 0xFF
.equ BROADCAST_MAC_5, 0xFF

; ─── Экспорт ──────────────────────────────────────────────────────────────────
.export ETHERTYPE_IPV4
.export ETHERTYPE_ARP
.export IP_PROTO_ICMP
.export IP_PROTO_TCP
.export IP_PROTO_UDP
.export ARP_REQUEST
.export ARP_REPLY
.export ETHER_HEADER_SIZE
.export ARP_PACKET_SIZE
.export IP_HEADER_SIZE
.export ICMP_HEADER_SIZE
.export ETHER_DST_OFF
.export ETHER_SRC_OFF
.export ETHER_TYPE_OFF
.export ETHER_PAYLOAD_OFF
.export IP_PROTO_OFF
.export IP_SRC_OFF
.export IP_DST_OFF
.export IP_TOTAL_LEN_OFF
.export DHCP_CLIENT_PORT
.export DHCP_SERVER_PORT
.export DHCP_DISCOVER
.export DHCP_OFFER
.export DHCP_REQUEST
.export DHCP_ACK
.export DHCP_NAK
.export UDP_HEADER_SIZE
.export DHCP_MAGIC_OFF
.export DHCP_OPTIONS_OFF

; ─── UDP ────────────────────────────────────────────────────────────────────────
.equ UDP_HEADER_SIZE, 8        ; [src_port(2)][dst_port(2)][length(2)][checksum(2)]
.equ UDP_SRC_PORT_OFF, 0
.equ UDP_DST_PORT_OFF, 2
.equ UDP_LENGTH_OFF, 4
.equ UDP_CHECKSUM_OFF, 6
.equ UDP_DATA_OFF, 8

; ─── DHCP (поверх BOOTP) ────────────────────────────────────────────────────────
.equ DHCP_CLIENT_PORT, 68
.equ DHCP_SERVER_PORT, 67
.equ DHCP_DISCOVER, 1
.equ DHCP_OFFER, 2
.equ DHCP_REQUEST, 3
.equ DHCP_ACK, 5
.equ DHCP_NAK, 6
.equ DHCP_BOOTP_SIZE, 236      ; размер BOOTP-заголовка
.equ DHCP_MAGIC_OFF, 236       ; смещение magic cookie в DHCP-пакете
.equ DHCP_OPTIONS_OFF, 240     ; смещение начала опций
.equ DHCP_OP_OFF, 0            ; смещение поля op
.equ DHCP_XID_OFF, 4           ; смещение transaction ID
.equ DHCP_YIADDR_OFF, 16       ; смещение yiaddr (your IP)
.equ DHCP_SIADDR_OFF, 20       ; смещение siaddr (server IP)
.equ DHCP_CHADDR_OFF, 28       ; смещение chaddr (client MAC)
