/**
 * Тесты протоколов UDP и DHCP.
 * Проверяют build → parse roundtrip и конечный автомат DhcpClient.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUdpPacket, parseUdpPacket,
  buildDhcpPacket, parseDhcpPacket,
  DhcpClient,
  DHCP_DISCOVER, DHCP_OFFER, DHCP_REQUEST, DHCP_ACK, DHCP_NAK,
  DHCP_CLIENT_PORT, DHCP_SERVER_PORT,
} from "../src/game/net-dhcp.js";

// ─── UDP ──────────────────────────────────────────────────────────────────────
test("UDP: build → parse roundtrip", () => {
  const data = new Uint8Array([1, 2, 3]);
  const udp = buildUdpPacket(68, 67, data);
  assert.equal(udp.length, 8 + 3, "UDP заголовок(8) + данные(3) = 11");
  const parsed = parseUdpPacket(udp);
  assert.equal(parsed.srcPort, 68);
  assert.equal(parsed.dstPort, 67);
  assert.equal(parsed.length, 11);
  assert.deepEqual([...parsed.data], [1, 2, 3]);
});

test("UDP: build → parse с другими портами", () => {
  const data = new Uint8Array(100);
  const udp = buildUdpPacket(12345, 8080, data);
  const parsed = parseUdpPacket(udp);
  assert.equal(parsed.srcPort, 12345);
  assert.equal(parsed.dstPort, 8080);
});

// ─── DHCP ────────────────────────────────────────────────────────────────────
test("DHCP: build DISCOVER → parse", () => {
  const mac = new Uint8Array([0x02, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
  const packet = buildDhcpPacket({ op: 1, xid: 42, chaddr: mac, dhcpType: DHCP_DISCOVER });
  assert.ok(packet.length >= 240, "DHCP-пакет минимум 240 байт");
  assert.ok(packet.length < 576, "DHCP-пакет меньше 576 байт");
  const parsed = parseDhcpPacket(packet);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dhcpType, DHCP_DISCOVER);
  assert.equal(parsed.xid, 42);
  assert.equal(parsed.chaddr[0], 0x02);
});

test("DHCP: build OFFER с полным набором опций → parse", () => {
  const mac = new Uint8Array([0x02, 0x11, 0x22, 0x33, 0x44, 0x55]);
  const yiaddr = new Uint8Array([10, 42, 0, 15]);
  const serverIp = new Uint8Array([10, 42, 0, 1]);
  const subnet = new Uint8Array([255, 255, 255, 0]);
  const router = new Uint8Array([10, 42, 0, 1]);
  const dns = new Uint8Array([10, 42, 0, 1]);
  const domain = "ship.local";
  const packet = buildDhcpPacket({
    op: 2, xid: 99, chaddr: mac, dhcpType: DHCP_OFFER,
    yiaddr, serverIp, leaseTime: 3600,
    subnetMask: subnet, router, dns, domain,
  });
  const parsed = parseDhcpPacket(packet);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dhcpType, DHCP_OFFER);
  assert.equal(parsed.xid, 99);
  assert.equal(parsed.yiaddr[0], 10);
  assert.equal(parsed.yiaddr[3], 15);
  assert.equal(parsed.leaseTime, 3600);
  assert.equal(parsed.subnetMask[0], 255);
  assert.equal(parsed.router[0], 10);
  assert.equal(parsed.dns[0], 10);
  assert.equal(parsed.domain, domain);
});

test("DHCP: build ACK → parse", () => {
  const mac = new Uint8Array(6);
  const yiaddr = new Uint8Array([10, 42, 0, 20]);
  const serverIp = new Uint8Array([10, 42, 0, 1]);
  const packet = buildDhcpPacket({
    op: 2, xid: 100, chaddr: mac, dhcpType: DHCP_ACK,
    yiaddr, serverIp, leaseTime: 7200,
  });
  const parsed = parseDhcpPacket(packet);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dhcpType, DHCP_ACK);
  assert.equal(parsed.leaseTime, 7200);
});

// ─── DhcpClient ──────────────────────────────────────────────────────────────
test("DhcpClient: полный поток DISCOVER → OFFER → REQUEST → ACK", () => {
  const mac = new Uint8Array([0x02, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
  const client = new DhcpClient(mac);
  const startPkt = client.start();
  assert.equal(client.state, "selecting", "после start состояние = selecting");
  assert.ok(startPkt.length >= 240);

  // Разбираем DISCOVER, проверяем что он корректен
  const parsedStart = parseDhcpPacket(startPkt);
  assert.equal(parsedStart.ok, true);
  assert.equal(parsedStart.dhcpType, DHCP_DISCOVER);

  // Сервер отвечает OFFER
  const offer = buildDhcpPacket({
    op: 2, xid: client.xid, chaddr: mac, dhcpType: DHCP_OFFER,
    yiaddr: new Uint8Array([10, 42, 0, 20]),
    serverIp: new Uint8Array([10, 42, 0, 1]),
    leaseTime: 7200,
    subnetMask: new Uint8Array([255, 255, 255, 0]),
  });
  const resp = client.handlePacket(offer);
  assert.ok(resp, "handlePacket(OFFER) должен вернуть ответ");
  assert.equal(resp.action, "request");
  assert.equal(client.state, "requesting", "после OFFER состояние = requesting");

  // Сервер отвечает ACK
  const ack = buildDhcpPacket({
    op: 2, xid: client.xid, chaddr: mac, dhcpType: DHCP_ACK,
    yiaddr: new Uint8Array([10, 42, 0, 20]),
    serverIp: new Uint8Array([10, 42, 0, 1]),
    leaseTime: 7200,
  });
  const resp2 = client.handlePacket(ack);
  assert.equal(resp2.action, "bound");
  assert.equal(client.state, "bound", "после ACK состояние = bound");
  assert.equal(client.assignedIp[3], 20, "IP должен быть 10.42.0.20");
  assert.equal(client.leaseTime, 7200);
});

test("DhcpClient: NAK возвращает в INIT и шлёт новый DISCOVER", () => {
  const mac = new Uint8Array(6);
  const client = new DhcpClient(mac);
  client.start();
  // Вручную переводим в requesting
  client.state = "requesting";
  client.xid = 42;
  // Шлём NAK
  const nak = buildDhcpPacket({
    op: 2, xid: 42, chaddr: mac, dhcpType: DHCP_NAK,
  });
  const resp = client.handlePacket(nak);
  assert.equal(resp.action, "nak");
  assert.ok(resp.packet.length >= 240, "новый DISCOVER отправлен");
  assert.equal(client.state, "selecting", "после NAK состояние = selecting");
});

test("DhcpClient: игнорирует пакет с чужим xid", () => {
  const mac = new Uint8Array(6);
  const client = new DhcpClient(mac);
  client.start();
  client.state = "selecting";
  const offer = buildDhcpPacket({
    op: 2, xid: 999, chaddr: mac, dhcpType: DHCP_OFFER,
    yiaddr: new Uint8Array([10, 42, 0, 99]),
  });
  const resp = client.handlePacket(offer);
  assert.equal(resp, null, "чужой xid должен вернуть null");
  assert.equal(client.state, "selecting", "состояние не изменилось");
});