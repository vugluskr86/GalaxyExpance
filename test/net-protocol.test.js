/**
 * Тесты сетевых протоколов: ARP, IP, ICMP.
 * Проверяют build → parse roundtrip для каждого протокола.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArpPacket, parseArpPacket, buildArpFrame,
  buildIpHeader, parseIpHeader, buildIpFrame,
  buildIcmpEcho, parseIcmp,
  checksum16,
  macFromString, macToString,
  ipFromString, ipToString,
  ArpTable,
  ARP_REQUEST, ARP_REPLY,
  ETHERTYPE_ARP, ETHERTYPE_IPV4,
  IP_PROTO_ICMP, IP_PROTO_UDP, IP_PROTO_TCP,
  BROADCAST_MAC, ZERO_MAC,
} from "../src/game/net-protocol.js";

// ─── ARP ─────────────────────────────────────────────────────────────────────
test("ARP: build → parse roundtrip (request)", () => {
  const sha = macFromString("02:11:22:33:44:55");
  const spa = ipFromString("10.42.0.1");
  const tha = ZERO_MAC;
  const tpa = ipFromString("10.42.0.15");
  const packet = buildArpPacket(ARP_REQUEST, sha, spa, tha, tpa);
  assert.equal(packet.length, 28, "ARP packet должен быть 28 байт");
  const parsed = parseArpPacket(packet);
  assert.equal(parsed.oper, ARP_REQUEST, "oper должен быть ARP_REQUEST");
  assert.equal(macToString(parsed.sha), "02:11:22:33:44:55");
  assert.equal(ipToString(parsed.spa), "10.42.0.1");
  assert.equal(ipToString(parsed.tpa), "10.42.0.15");
  assert.equal(macToString(parsed.tha), "00:00:00:00:00:00");
});

test("ARP: build → parse roundtrip (reply)", () => {
  const sha = macFromString("02:AA:BB:CC:DD:EE");
  const spa = ipFromString("192.168.1.1");
  const tha = macFromString("02:11:22:33:44:55");
  const tpa = ipFromString("192.168.1.100");
  const packet = buildArpPacket(ARP_REPLY, sha, spa, tha, tpa);
  const parsed = parseArpPacket(packet);
  assert.equal(parsed.oper, ARP_REPLY);
  assert.equal(macToString(parsed.tha), "02:11:22:33:44:55");
  assert.equal(ipToString(parsed.spa), "192.168.1.1");
});

test("ARP: buildArpFrame создаёт корректный Ethernet-фрейм", () => {
  const sha = macFromString("02:11:22:33:44:55");
  const spa = ipFromString("10.0.0.1");
  const arpPkt = buildArpPacket(ARP_REQUEST, sha, spa, ZERO_MAC, ipFromString("10.0.0.2"));
  const frame = buildArpFrame(BROADCAST_MAC, sha, arpPkt);
  assert.equal(frame.length, 14 + 28, "Ethernet + ARP = 42 байт");
  const view = new DataView(frame.buffer);
  assert.equal(view.getUint16(12, false), ETHERTYPE_ARP, "EtherType должен быть 0x0806 (ARP)");
  assert.equal(macToString(frame.slice(0, 6)), "ff:ff:ff:ff:ff:ff");
});

// ─── ARP-таблица ─────────────────────────────────────────────────────────────
test("ArpTable: update, lookup, purge", () => {
  const table = new ArpTable();
  const ip = ipFromString("10.42.0.15");
  const mac = macFromString("02:AA:BB:CC:DD:EE");
  assert.equal(table.lookup(ip), null, "пустая таблица — null");
  table.update(ip, mac);
  const found = table.lookup(ip);
  assert.ok(found, "должен найти после update");
  assert.equal(macToString(found), "02:aa:bb:cc:dd:ee");
  table.entries.get("10.42.0.15").expires = Date.now() - 1;
  assert.equal(table.lookup(ip), null, "истекшая запись должна вернуть null");
});

// ─── IP ──────────────────────────────────────────────────────────────────────
test("IP: buildIpHeader → parseIpHeader roundtrip", () => {
  const srcIp = ipFromString("10.42.0.1");
  const dstIp = ipFromString("10.42.0.15");
  const header = buildIpHeader({ srcIp, dstIp, protocol: IP_PROTO_ICMP, totalLength: 28, ttl: 64 });
  assert.equal(header.length, 20, "IP-заголовок должен быть 20 байт");
  const parsed = parseIpHeader(header);
  assert.equal(parsed.ok, true, "parseIpHeader.ok должно быть true");
  assert.equal(parsed.protocol, IP_PROTO_ICMP);
  assert.equal(parsed.totalLength, 28);
  assert.equal(ipToString(parsed.srcIp), "10.42.0.1");
  assert.equal(ipToString(parsed.dstIp), "10.42.0.15");
});

test("IP: повреждённый checksum обнаруживается", () => {
  const header = buildIpHeader({
    srcIp: ipFromString("1.1.1.1"),
    dstIp: ipFromString("2.2.2.2"),
    protocol: IP_PROTO_UDP, totalLength: 100,
  });
  assert.equal(parseIpHeader(header).ok, true);
  const corrupted = new Uint8Array(header);
  corrupted[15] ^= 0xFF;
  assert.equal(parseIpHeader(corrupted).ok, false, "повреждённый заголовок должен вернуть ok=false");
});

// ─── ICMP ────────────────────────────────────────────────────────────────────
test("ICMP: buildIcmpEcho → parseIcmp roundtrip", () => {
  const echo = buildIcmpEcho(1, 1);
  assert.equal(echo.length, 40, "ICMP Echo по умолчанию = 40 байт");
  const parsed = parseIcmp(echo);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.type, 8, "type = Echo Request");
  assert.equal(parsed.id, 1);
  assert.equal(parsed.seq, 1);
});

test("ICMP: checksum обнаруживает повреждённый пакет", () => {
  const echo = buildIcmpEcho(1, 1);
  const corrupted = new Uint8Array(echo);
  corrupted[10] ^= 0xFF;
  assert.equal(parseIcmp(corrupted).ok, false);
});

// ─── Checksum16 ──────────────────────────────────────────────────────────────
test("checksum16: сходимость в 0 после записи", () => {
  const data = new Uint8Array([
    0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x11, 0x00, 0x00, 0xc0, 0xa8, 0x00, 0x01,
    0xc0, 0xa8, 0x00, 0xc7,
  ]);
  const cs = checksum16(data);
  const copy = new Uint8Array(data);
  copy[10] = (cs >> 8) & 0xFF;
  copy[11] = cs & 0xFF;
  assert.equal(checksum16(copy), 0, "checksum должен сходиться в 0");
});

// ─── Конвертеры ──────────────────────────────────────────────────────────────
test("macFromString ↔ macToString roundtrip", () => {
  const mac = macFromString("02:ab:cd:ef:01:23");
  assert.equal(mac.length, 6);
  assert.equal(macToString(mac), "02:ab:cd:ef:01:23");
});

test("ipFromString ↔ ipToString roundtrip", () => {
  const ip = ipFromString("192.168.42.7");
  assert.equal(ip.length, 4);
  assert.equal(ipToString(ip), "192.168.42.7");
});