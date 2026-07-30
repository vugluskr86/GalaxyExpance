/**
 * net-protocol.js — Реализация протоколов ARP и IP для сетевого стека.
 * =============================================================================
 * Используется как эталонная реализация для тестирования. Ядро assembly
 * реализует ту же логику в system/unix/kernel/net.asm, используя сисколлы
 * SYS_NET_SEND/SYS_NET_RECV для доступа к Ethernet-уровню.
 *
 * Поддерживаемые протоколы:
 *   - ARP  (RFC 826)  — резолвинг IP → MAC
 *   - IPv4 (RFC 791)  — фрейминг пакетов
 *   - ICMP (RFC 792)  — ping (echo request/reply)
 *
 * Константы:
 *   - Ethernet-фрейм:  [dst_mac(6)][src_mac(6)][ethertype(2)][payload]
 *   - EtherType:       0x0806 = ARP, 0x0800 = IPv4
 *   - ARP-пакет:       [htype(2)][ptype(2)][hlen(1)][plen(1)][oper(2)]
 *                      [sha(6)][spa(4)][tha(6)][tpa(4)]
 *   - IP-заголовок:    20 байт (без опций), затем данные
 * =============================================================================
 */

/** Широковещательный MAC-адрес */
export const BROADCAST_MAC = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

/** Нулевой MAC-адрес (для ARP-запросов: tha = 00:00:00:00:00:00) */
export const ZERO_MAC = new Uint8Array(6);

/** EtherType значения */
export const ETHERTYPE_IPV4 = 0x0800;
export const ETHERTYPE_ARP = 0x0806;

/** IP-протоколы */
export const IP_PROTO_ICMP = 1;
export const IP_PROTO_TCP = 6;
export const IP_PROTO_UDP = 17;

/** ARP-операции */
export const ARP_REQUEST = 1;
export const ARP_REPLY = 2;

/** ARP-аппаратный тип: Ethernet */
const ARP_HTYPE_ETHERNET = 1;

// ─── Вспомогательные функции ──────────────────────────────────────────────────

/** Преобразование MAC-строки "xx:xx:xx:xx:xx:xx" в Uint8Array(6) */
export function macFromString(str) {
  const parts = str.split(":").map(h => parseInt(h, 16));
  if (parts.length !== 6) throw new Error(`Invalid MAC: ${str}`);
  return Uint8Array.from(parts);
}

/** Преобразование Uint8Array(6) в MAC-строку */
export function macToString(mac) {
  return [...mac].map(b => b.toString(16).padStart(2, "0")).join(":");
}

/** Преобразование IP-строки "10.42.0.15" в Uint8Array(4) */
export function ipFromString(str) {
  const parts = str.split(".").map(n => parseInt(n, 10));
  if (parts.length !== 4 || parts.some(n => n < 0 || n > 255))
    throw new Error(`Invalid IP: ${str}`);
  return Uint8Array.from(parts);
}

/** Преобразование Uint8Array(4) в IP-строку */
export function ipToString(ip) {
  return [...ip].join(".");
}

/** Вычисление 16-битной Internet checksum (RFC 1071).
 *  Используется для IP-заголовка, ICMP, UDP (опционально), TCP. */
export function checksum16(data, initial = 0) {
  let sum = initial;
  for (let i = 0; i < data.length - 1; i += 2) {
    sum += (data[i] << 8) | data[i + 1];
  }
  if (data.length % 2 === 1) {
    sum += (data[data.length - 1] << 8);
  }
  while (sum > 0xFFFF) {
    sum = (sum & 0xFFFF) + (sum >> 16);
  }
  return (~sum) & 0xFFFF;
}

// ─── ARP ──────────────────────────────────────────────────────────────────────

/** Построить ARP-пакет (без Ethernet-заголовка).
 *  @param {number} oper — ARP_REQUEST (1) или ARP_REPLY (2)
 *  @param {Uint8Array} sha — MAC отправителя (6 байт)
 *  @param {Uint8Array} spa — IP отправителя (4 байта)
 *  @param {Uint8Array} tha — MAC получателя (6 байт, нули для запроса)
 *  @param {Uint8Array} tpa — IP получателя (4 байта)
 *  @returns {Uint8Array} — ARP-пакет (28 байт)
 */
export function buildArpPacket(oper, sha, spa, tha, tpa) {
  const packet = new Uint8Array(28);
  const view = new DataView(packet.buffer);
  view.setUint16(0, ARP_HTYPE_ETHERNET, false);   // htype = Ethernet (1), big-endian
  view.setUint16(2, ETHERTYPE_IPV4, false);         // ptype = IPv4 (0x0800), big-endian
  packet[4] = 6;   // hlen = длина MAC (6)
  packet[5] = 4;   // plen = длина IP (4)
  view.setUint16(6, oper, false);                   // oper, big-endian
  packet.set(sha, 8);   // sha (6 байт)
  packet.set(spa, 14);  // spa (4 байта)
  packet.set(tha, 18);  // tha (6 байт)
  packet.set(tpa, 24);  // tpa (4 байта)
  return packet;
}

/**
 * Разобрать ARP-пакет.
 * @param {Uint8Array} packet — 28-байтный ARP-пакет
 * @returns {{oper: number, sha: Uint8Array, spa: Uint8Array, tha: Uint8Array, tpa: Uint8Array}}
 */
export function parseArpPacket(packet) {
  if (packet.length < 28) throw new Error("ARP packet too short");
  const view = new DataView(packet.buffer, packet.byteOffset, 28);
  const htype = view.getUint16(0, false);
  const ptype = view.getUint16(2, false);
  const hlen = packet[4];
  const plen = packet[5];
  if (htype !== ARP_HTYPE_ETHERNET || ptype !== ETHERTYPE_IPV4)
    throw new Error(`Unsupported ARP: htype=${htype} ptype=${ptype}`);
  if (hlen !== 6 || plen !== 4)
    throw new Error(`Unsupported ARP address lengths: hlen=${hlen} plen=${plen}`);
  return {
    oper: view.getUint16(6, false),
    sha: packet.slice(8, 14),
    spa: packet.slice(14, 18),
    tha: packet.slice(18, 24),
    tpa: packet.slice(24, 28),
  };
}

/**
 * Построить полный Ethernet-фрейм с ARP-пакетом.
 * @returns {Uint8Array} — готовый Ethernet-фрейм
 */
export function buildArpFrame(dstMac, srcMac, arpPacket) {
  const frame = new Uint8Array(14 + arpPacket.length);
  frame.set(dstMac, 0);        // Ethernet dst
  frame.set(srcMac, 6);        // Ethernet src
  const view = new DataView(frame.buffer);
  view.setUint16(12, ETHERTYPE_ARP, false);  // EtherType = ARP, big-endian
  frame.set(arpPacket, 14);
  return frame;
}

// ─── ARP-таблица (IP → MAC кэш) ──────────────────────────────────────────────

/** Простая ARP-таблица с TTL-записями. */
export class ArpTable {
  constructor() {
    /** @type {Map<string, {mac: Uint8Array, expires: number}>} */
    this.entries = new Map();  // ключ = ipToString(ip)
    this.ttlMs = 300000;       // время жизни записи (5 минут)
  }

  /** Добавить/обновить запись в ARP-таблице */
  update(ip, mac) {
    const key = ipToString(ip);
    this.entries.set(key, { mac: new Uint8Array(mac), expires: Date.now() + this.ttlMs });
  }

  /** Найти MAC по IP. Возвращает null если не найдено или истекло. */
  lookup(ip) {
    const key = ipToString(ip);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.entries.delete(key);
      return null;
    }
    return entry.mac;
  }

  /** Очистить просроченные записи */
  purge() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.expires) this.entries.delete(key);
    }
  }
}

// ─── IPv4 ─────────────────────────────────────────────────────────────────────

/**
 * Построить IP-заголовок (20 байт, без опций).
 * Все многобайтовые поля — big-endian (сетевой порядок байт).
 * @param {object} opts
 * @param {Uint8Array} opts.srcIp — IP отправителя (4 байта)
 * @param {Uint8Array} opts.dstIp — IP получателя (4 байта)
 * @param {number} opts.protocol — IP_PROTO_UDP, IP_PROTO_TCP, IP_PROTO_ICMP
 * @param {number} opts.totalLength — общая длина IP-пакета (заголовок + данные)
 * @param {number} [opts.ttl=64] — time to live
 * @param {number} [opts.id=0] — идентификатор пакета
 * @returns {Uint8Array} — 20-байтный IP-заголовок
 */
export function buildIpHeader({ srcIp, dstIp, protocol, totalLength, ttl = 64, id = 0 }) {
  const header = new Uint8Array(20);
  const view = new DataView(header.buffer);
  header[0] = 0x45;  // Version=4, IHL=5 (20 байт)
  header[1] = 0;     // DSCP + ECN (не используется)
  view.setUint16(2, totalLength, false);  // Total Length, big-endian
  view.setUint16(4, id & 0xFFFF, false);  // Identification
  view.setUint16(6, 0, false);            // Flags(3) + Fragment Offset(13) = 0
  header[8] = ttl;                         // TTL
  header[9] = protocol;                    // Protocol
  // checksum (10-11) — вычислим ниже
  header.set(srcIp, 12);   // Source IP (4 байта)
  header.set(dstIp, 16);   // Destination IP (4 байта)
  // Вычисляем checksum IP-заголовка
  const cs = checksum16(header);
  view.setUint16(10, cs, false);
  return header;
}

/**
 * Проверить IP-заголовок (корректность checksum, версия).
 * @param {Uint8Array} header — 20 байт заголовка
 * @returns {{ok: boolean, reason?: string, protocol?: number, srcIp?: Uint8Array, dstIp?: Uint8Array, totalLength?: number}}
 */
export function parseIpHeader(header) {
  if (header.length < 20) return { ok: false, reason: "too-short" };
  const version = (header[0] >> 4) & 0x0F;
  if (version !== 4) return { ok: false, reason: `bad-version: ${version}` };
  const ihl = header[0] & 0x0F;
  if (ihl < 5) return { ok: false, reason: `bad-ihl: ${ihl}` };
  const view = new DataView(header.buffer, header.byteOffset, 20);
  const totalLength = view.getUint16(2, false);
  const protocol = header[9];
  const storedSum = view.getUint16(10, false);
  // Проверка checksum: обнуляем поле checksum, считаем заново
  const copy = new Uint8Array(header.subarray(0, 20));
  copy[10] = 0;
  copy[11] = 0;
  const computed = checksum16(copy);
  if (storedSum !== 0 && storedSum !== computed) {
    return { ok: false, reason: `bad-checksum: ${storedSum.toString(16)} vs ${computed.toString(16)}` };
  }
  return {
    ok: true,
    protocol,
    totalLength,
    srcIp: header.slice(12, 16),
    dstIp: header.slice(16, 20),
  };
}

/**
 * Построить полный Ethernet-фрейм с IP-пакетом.
 */
export function buildIpFrame(dstMac, srcMac, ipHeader, ipData) {
  const payload = new Uint8Array(ipHeader.length + ipData.length);
  payload.set(ipHeader, 0);
  payload.set(ipData, ipHeader.length);
  const frame = new Uint8Array(14 + payload.length);
  frame.set(dstMac, 0);
  frame.set(srcMac, 6);
  const view = new DataView(frame.buffer);
  view.setUint16(12, ETHERTYPE_IPV4, false);
  frame.set(payload, 14);
  return frame;
}

// ─── ICMP ─────────────────────────────────────────────────────────────────────

/**
 * Построить ICMP Echo Request (ping).
 * @param {number} id — идентификатор
 * @param {number} seq — номер последовательности
 * @param {Uint8Array} [data] — данные (по умолчанию 32 байта нулей)
 * @returns {Uint8Array} — ICMP-пакет (заголовок 8 байт + данные)
 */
export function buildIcmpEcho(id, seq, data = null) {
  if (!data) {
    data = new Uint8Array(32);
    for (let i = 0; i < 32; i++) data[i] = i & 0xFF;
  }
  const packet = new Uint8Array(8 + data.length);
  const view = new DataView(packet.buffer);
  packet[0] = 8;  // Type = Echo Request
  packet[1] = 0;  // Code = 0
  view.setUint16(4, id & 0xFFFF, false);
  view.setUint16(6, seq & 0xFFFF, false);
  packet.set(data, 8);
  // Checksum (над всем ICMP-пакетом)
  const cs = checksum16(packet);
  view.setUint16(2, cs, false);
  return packet;
}

/**
 * Разобрать ICMP-пакет.
 */
export function parseIcmp(packet) {
  if (packet.length < 8) return { ok: false, reason: "too-short" };
  const view = new DataView(packet.buffer, packet.byteOffset, packet.length);
  const type = packet[0];
  const code = packet[1];
  const storedSum = view.getUint16(2, false);
  const id = view.getUint16(4, false);
  const seq = view.getUint16(6, false);
  const copy = new Uint8Array(packet);
  copy[2] = 0; copy[3] = 0;
  const computed = checksum16(copy);
  if (storedSum !== computed)
    return { ok: false, reason: "bad-checksum" };
  return { ok: true, type, code, id, seq, data: packet.slice(8) };
}