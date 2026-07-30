/**
 * net-dhcp.js — Реализация DHCP-клиента (RFC 2131) и UDP-датаграмм.
 * =============================================================================
 * Эталонная реализация для тестов. Ядро assembly реализует ту же логику
 * в system/unix/kernel/net.asm через сисколлы SYS_NET_SEND/SYS_NET_RECV.
 *
 * Поток DHCP:
 *   1. Клиент → DHCPDISCOVER (broadcast, src=0.0.0.0:68 → dst=255.255.255.255:67)
 *   2. Сервер → DHCPOFFER (yiaddr = предложенный IP)
 *   3. Клиент → DHCPREQUEST (подтверждает IP)
 *   4. Сервер → DHCPACK (финальное подтверждение)
 *
 * Формат DHCP поверх BOOTP:
 *   [op(1)][htype(1)][hlen(1)][hops(1)]
 *   [xid(4)][secs(2)][flags(2)]
 *   [ciaddr(4)][yiaddr(4)][siaddr(4)][giaddr(4)]
 *   [chaddr(16)][sname(64)][file(128)]
 *   [options: cookie(4) + TLV-опции... + 0xFF]
 * =============================================================================
 */

import { ipToString } from "./net-protocol.js";

/** Порты BOOTP/DHCP */
export const DHCP_CLIENT_PORT = 68;
export const DHCP_SERVER_PORT = 67;

/** Типы DHCP-сообщений (DHCP option 53) */
export const DHCP_DISCOVER = 1;
export const DHCP_OFFER = 2;
export const DHCP_REQUEST = 3;
export const DHCP_DECLINE = 4;
export const DHCP_ACK = 5;
export const DHCP_NAK = 6;
export const DHCP_RELEASE = 7;

/** Magic cookie: 99.130.83.99 */
const DHCP_MAGIC_COOKIE = new Uint8Array([99, 130, 83, 99]);

// ─── UDP ──────────────────────────────────────────────────────────────────────

/**
 * Построить UDP-датаграмму.
 * @param {number} srcPort
 * @param {number} dstPort
 * @param {Uint8Array} data
 * @returns {Uint8Array} — 8-байтный заголовок + данные
 */
export function buildUdpPacket(srcPort, dstPort, data) {
  const packet = new Uint8Array(8 + data.length);
  const view = new DataView(packet.buffer);
  view.setUint16(0, srcPort & 0xFFFF, false);
  view.setUint16(2, dstPort & 0xFFFF, false);
  view.setUint16(4, packet.length, false);
  view.setUint16(6, 0, false);           // checksum = 0 (опционально)
  packet.set(data, 8);
  return packet;
}

/**
 * Разобрать UDP-датаграмму.
 * @param {Uint8Array} packet
 * @returns {{srcPort: number, dstPort: number, length: number, data: Uint8Array}}
 */
export function parseUdpPacket(packet) {
  if (packet.length < 8) throw new Error("UDP packet too short");
  const view = new DataView(packet.buffer, packet.byteOffset, 8);
  return {
    srcPort: view.getUint16(0, false),
    dstPort: view.getUint16(2, false),
    length: view.getUint16(4, false),
    data: packet.slice(8),
  };
}

// ─── DHCP ─────────────────────────────────────────────────────────────────────

/**
 * Построить DHCP-пакет.
 * @param {object} opts
 * @param {number} opts.op — 1=BOOTREQUEST, 2=BOOTREPLY
 * @param {number} opts.xid — transaction ID
 * @param {Uint8Array} opts.chaddr — MAC клиента (6 байт, пишется в chaddr[0..5])
 * @param {number} opts.dhcpType — тип DHCP-сообщения (DHCP_DISCOVER...)
 * @param {Uint8Array} [opts.requestedIp] — запрашиваемый IP (опция 50)
 * @param {Uint8Array} [opts.serverIp] — IP сервера (опция 54)
 * @param {Uint8Array} [opts.yiaddr] — предлагаемый IP (поле yiaddr)
 * @param {number} [opts.leaseTime] — время аренды в секундах (опция 51)
 * @param {Uint8Array} [opts.subnetMask] — маска подсети (опция 1)
 * @param {Uint8Array} [opts.router] — шлюз (опция 3)
 * @param {Uint8Array} [opts.dns] — DNS-сервер (опция 6)
 * @param {string} [opts.domain] — домен (опция 15)
 * @returns {Uint8Array} — DHCP-пакет (240+ байт)
 */
export function buildDhcpPacket(opts) {
  const packet = new Uint8Array(576);
  packet.fill(0);
  const view = new DataView(packet.buffer);

  // BOOTP-заголовок (236 байт)
  packet[0] = opts.op;
  packet[1] = 1;                  // htype = Ethernet
  packet[2] = 6;                  // hlen = 6
  packet[3] = 0;                  // hops
  view.setUint32(4, opts.xid >>> 0, false);
  view.setUint16(10, 0x8000, false); // flags = broadcast

  if (opts.yiaddr) packet.set(opts.yiaddr, 16);
  if (opts.serverIp) packet.set(opts.serverIp, 20);
  if (opts.chaddr) packet.set(opts.chaddr.subarray(0, 6), 28);

  // Magic cookie (смещение 236)
  packet.set(DHCP_MAGIC_COOKIE, 236);
  let off = 240;

  // Опция 53: DHCP Message Type (обязательна)
  packet[off++] = 53; packet[off++] = 1; packet[off++] = opts.dhcpType;

  // Опция 61: Client Identifier
  if (opts.chaddr) {
    packet[off++] = 61; packet[off++] = 7;
    packet[off++] = 1;  // type = Ethernet
    packet.set(opts.chaddr.subarray(0, 6), off); off += 6;
  }

  // Опция 50: Requested IP
  if (opts.requestedIp) {
    packet[off++] = 50; packet[off++] = 4;
    packet.set(opts.requestedIp, off); off += 4;
  }

  // Опция 54: Server Identifier
  if (opts.serverIp) {
    packet[off++] = 54; packet[off++] = 4;
    packet.set(opts.serverIp, off); off += 4;
  }

  // Опция 51: Lease Time
  if (opts.leaseTime !== undefined) {
    packet[off++] = 51; packet[off++] = 4;
    view.setUint32(off, opts.leaseTime >>> 0, false); off += 4;
  }

  // Опция 1: Subnet Mask
  if (opts.subnetMask) {
    packet[off++] = 1; packet[off++] = 4;
    packet.set(opts.subnetMask, off); off += 4;
  }

  // Опция 3: Router
  if (opts.router) {
    packet[off++] = 3; packet[off++] = 4;
    packet.set(opts.router, off); off += 4;
  }

  // Опция 6: DNS Server
  if (opts.dns) {
    packet[off++] = 6; packet[off++] = 4;
    packet.set(opts.dns, off); off += 4;
  }

  // Опция 15: Domain Name
  if (opts.domain) {
    const bytes = new TextEncoder().encode(opts.domain);
    packet[off++] = 15; packet[off++] = bytes.length;
    packet.set(bytes, off); off += bytes.length;
  }

  // End option
  packet[off++] = 255;

  return packet.slice(0, off);
}

/**
 * Разобрать DHCP-пакет.
 * @param {Uint8Array} packet
 * @returns {{ok: boolean, op?: number, xid?: number, yiaddr?: Uint8Array, siaddr?: Uint8Array, chaddr?: Uint8Array, dhcpType?: number, serverIp?: Uint8Array, leaseTime?: number, subnetMask?: Uint8Array, router?: Uint8Array, dns?: Uint8Array, domain?: string, reason?: string}}
 */
export function parseDhcpPacket(packet) {
  if (packet.length < 240) return { ok: false, reason: "too-short" };
  const view = new DataView(packet.buffer, packet.byteOffset, packet.length);
  const op = packet[0];
  const xid = view.getUint32(4, false);
  const yiaddr = packet.slice(16, 20);
  const siaddr = packet.slice(20, 24);
  const chaddr = packet.slice(28, 34);

  // Magic cookie
  const cookie = packet.slice(236, 240);
  if (cookie[0] !== 99 || cookie[1] !== 130 || cookie[2] !== 83 || cookie[3] !== 99)
    return { ok: false, reason: "bad-cookie" };

  const result = { ok: true, op, xid, yiaddr, siaddr, chaddr, dhcpType: 0,
    serverIp: null, requestedIp: null, leaseTime: 0, subnetMask: null, router: null, dns: null, domain: null };

  let off = 240;
  while (off < packet.length) {
    const code = packet[off++];
    if (code === 255) break;
    if (code === 0) continue;
    if (off >= packet.length) break;
    const len = packet[off++];
    if (off + len > packet.length) break;
    const value = packet.slice(off, off + len);
    off += len;

    switch (code) {
      case 53: result.dhcpType = value[0]; break;
      case 54: result.serverIp = value; break;
      case 51:
        if (value.length >= 4)
          result.leaseTime = new DataView(value.buffer, value.byteOffset, 4).getUint32(0, false);
        break;
      case 50: result.requestedIp = value; break;
      case 1: result.subnetMask = value; break;
      case 3: result.router = value; break;
      case 6: result.dns = value; break;
      case 15: result.domain = new TextDecoder().decode(value); break;
    }
  }

  if (result.dhcpType === 0) return { ok: false, reason: "missing-dhcp-type" };
  return result;
}

// ─── DHCP-клиент (конечный автомат) ───────────────────────────────────────────

/** Состояния DHCP-клиента */
export const DHCP_STATE_INIT = "init";
export const DHCP_STATE_SELECTING = "selecting";
export const DHCP_STATE_REQUESTING = "requesting";
export const DHCP_STATE_BOUND = "bound";

/**
 * Простой DHCP-клиент (конечный автомат).
 * Каждый вызов tick() должен вызываться при получении нового фрейма.
 */
export class DhcpClient {
  /**
   * @param {Uint8Array} mac — MAC-адрес интерфейса (6 байт)
   */
  constructor(mac) {
    this.mac = new Uint8Array(mac);
    this.state = DHCP_STATE_INIT;
    this.xid = 0;
    this.assignedIp = null;    // Uint8Array(4) — полученный IP
    this.subnetMask = null;
    this.router = null;
    this.dns = null;
    this.domain = null;
    this.leaseTime = 0;
    this.serverIp = null;
    this._lastDiscover = 0;
  }

  /** Запустить процесс получения IP */
  start() {
    this.state = DHCP_STATE_INIT;
    this.xid = (Math.random() * 0xFFFFFFFF) >>> 0;
    return this._sendDiscover();
  }

  /**
   * Обработать входящий DHCP-пакет.
   * @param {Uint8Array} rawPacket — сырой DHCP-пакет
   * @returns {{action: string, packet: Uint8Array}|null} — действие для отправки
   */
  handlePacket(rawPacket) {
    const parsed = parseDhcpPacket(rawPacket);
    if (!parsed.ok) return null;
    if (parsed.xid !== this.xid) return null;  // не наш xid

    switch (this.state) {
      case DHCP_STATE_SELECTING:
        if (parsed.dhcpType === DHCP_OFFER) {
          this.state = DHCP_STATE_REQUESTING;
          this.serverIp = parsed.siaddr;
          return { action: "request", packet: this._sendRequest(parsed.yiaddr) };
        }
        break;

      case DHCP_STATE_REQUESTING:
        if (parsed.dhcpType === DHCP_ACK) {
          this.state = DHCP_STATE_BOUND;
          this.assignedIp = parsed.yiaddr;
          this.subnetMask = parsed.subnetMask;
          this.router = parsed.router;
          this.dns = parsed.dns;
          this.domain = parsed.domain;
          this.leaseTime = parsed.leaseTime;
          return { action: "bound" };
        }
        if (parsed.dhcpType === DHCP_NAK) {
          this.state = DHCP_STATE_INIT;
          return { action: "nak", packet: this._sendDiscover() };
        }
        break;
    }
    return null;
  }

  _sendDiscover() {
    this.state = DHCP_STATE_SELECTING;
    return buildDhcpPacket({
      op: 1, xid: this.xid, chaddr: this.mac, dhcpType: DHCP_DISCOVER,
    });
  }

  _sendRequest(yiaddr) {
    return buildDhcpPacket({
      op: 1, xid: this.xid, chaddr: this.mac, dhcpType: DHCP_REQUEST,
      requestedIp: yiaddr, serverIp: this.serverIp,
    });
  }
}

// ─── DHCP-сервер ──────────────────────────────────────────────────────────────

/**
 * Простой DHCP-сервер (работает на коммутаторе).
 * Отвечает на DISCOVER → OFFER, REQUEST → ACK.
 * Пул адресов: 10.subnet.10 .. 10.subnet.254
 */
export class DhcpServer {
  /**
   * @param {object} config — { subnet, domain, leaseMinutes } из switchConfig
   */
  constructor(config) {
    /** @type {string} */
    this.subnet = config.subnet || "10.42.0";
    /** @type {string} */
    this.domain = config.domain || "ship.local";
    /** @type {number} */
    this.leaseMinutes = config.leaseMinutes || 60;
    /** @type {Map<string, {ip: Uint8Array, mac: Uint8Array, expires: number}>} */
    this.leases = new Map();  // ключ = MAC-строка
    this._nextIp = 10;        // следующий IP в пуле (10..254)
    this._gateway = null;     // Uint8Array(4) — IP коммутатора
  }

  /** Установить IP самого коммутатора (для siaddr и шлюза) */
  setGateway(ip) {
    this._gateway = new Uint8Array(ip);
  }

  /**
   * Обработать входящий DHCP-пакет.
   * @param {Uint8Array} rawPacket
   * @returns {{action: string, packet?: Uint8Array}|null}
   */
  handlePacket(rawPacket) {
    const parsed = parseDhcpPacket(rawPacket);
    if (!parsed.ok) return null;

    switch (parsed.dhcpType) {
      case DHCP_DISCOVER: return this._handleDiscover(parsed);
      case DHCP_REQUEST: return this._handleRequest(parsed);
      case DHCP_RELEASE: return this._handleRelease(parsed);
    }
    return null;
  }

  _handleDiscover(parsed) {
    const mac = parsed.chaddr;
    const macStr = [...mac].map(b => b.toString(16).padStart(2, "0")).join(":");
    // Выдаём IP из пула или существующий
    let ip;
    const existing = this.leases.get(macStr);
    if (existing && existing.expires > Date.now()) {
      ip = existing.ip;
    } else {
      const octets = this.subnet.split(".").map(n => Number(n) || 0);
      ip = new Uint8Array([octets[0] || 10, octets[1] || 42, octets[2] || 0, this._nextIp]);
      this._nextIp = this._nextIp >= 250 ? 10 : this._nextIp + 1;
    }

    const leaseSec = this.leaseMinutes * 60;
    this.leases.set(macStr, { ip, mac: new Uint8Array(mac), expires: Date.now() + leaseSec * 1000 });

    const subnetMask = new Uint8Array([255, 255, 255, 0]);
    const serverIp = this._gateway || new Uint8Array([10, 42, 0, 1]);

    return {
      action: "offer",
      packet: buildDhcpPacket({
        op: 2, xid: parsed.xid, chaddr: mac, dhcpType: DHCP_OFFER,
        yiaddr: ip, serverIp, leaseTime: leaseSec,
        subnetMask, router: serverIp, dns: serverIp, domain: this.domain,
      }),
    };
  }

  _handleRequest(parsed) {
    const mac = parsed.chaddr;
    const macStr = [...mac].map(b => b.toString(16).padStart(2, "0")).join(":");
    const existing = this.leases.get(macStr);

    // Проверяем, совпадает ли запрошенный IP с выданным
    if (existing && parsed.requestedIp) {
      const reqIp = parsed.requestedIp;
      if (existing.ip[0] === reqIp[0] && existing.ip[1] === reqIp[1] &&
          existing.ip[2] === reqIp[2] && existing.ip[3] === reqIp[3]) {
        const serverIp = this._gateway || new Uint8Array([10, 42, 0, 1]);
        existing.expires = Date.now() + this.leaseMinutes * 60 * 1000;
        return {
          action: "ack",
          packet: buildDhcpPacket({
            op: 2, xid: parsed.xid, chaddr: mac, dhcpType: DHCP_ACK,
            yiaddr: existing.ip, serverIp, leaseTime: this.leaseMinutes * 60,
            subnetMask: new Uint8Array([255, 255, 255, 0]),
            router: serverIp, dns: serverIp, domain: this.domain,
          }),
        };
      }
    }

    // NAK — IP не совпадает или аренда истекла
    return {
      action: "nak",
      packet: buildDhcpPacket({
        op: 2, xid: parsed.xid, chaddr: mac, dhcpType: DHCP_NAK,
      }),
    };
  }

  _handleRelease(parsed) {
    const macStr = [...parsed.chaddr].map(b => b.toString(16).padStart(2, "0")).join(":");
    this.leases.delete(macStr);
    return { action: "released" };
  }

  /** Получить список активных аренд для отображения */
  getLeaseList() {
    const now = Date.now();
    const list = [];
    for (const [mac, entry] of this.leases) {
      if (entry.expires > now) {
        list.push({ mac, ip: [...entry.ip].join("."), expires: Math.ceil((entry.expires - now) / 1000) });
      }
    }
    return list;
  }
}
