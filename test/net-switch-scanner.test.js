/**
 * Тесты DHCP-сервера, switch.asm и scanner.asm.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Assembler } from "../src/game/cpu.js";
import { makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";
import {
  DhcpServer, DhcpClient,
  buildDhcpPacket, DHCP_DISCOVER, DHCP_OFFER, DHCP_REQUEST, DHCP_ACK, DHCP_NAK,
} from "../src/game/net-dhcp.js";
import { autoWireNetwork, dhcpAll, switchConfig } from "../src/game/network.js";

// ─── DhcpServer ──────────────────────────────────────────────────────────────
test("DhcpServer: DISCOVER → OFFER с выдачей IP", () => {
  const server = new DhcpServer({ subnet: "10.42.0", domain: "ship.local", leaseMinutes: 60 });
  server.setGateway(new Uint8Array([10, 42, 0, 1]));
  const mac = new Uint8Array([0x02, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
  const client = new DhcpClient(mac);
  const discover = client.start();
  const resp = server.handlePacket(discover);
  assert.ok(resp, "сервер должен ответить на DISCOVER");
  assert.equal(resp.action, "offer");
  assert.ok(resp.packet.length >= 240);
});

test("DhcpServer: полный цикл DISCOVER → ACK", () => {
  const server = new DhcpServer({ subnet: "10.42.0", domain: "test.local", leaseMinutes: 120 });
  server.setGateway(new Uint8Array([10, 42, 0, 1]));
  const mac = new Uint8Array([0x02, 0x11, 0x22, 0x33, 0x44, 0x55]);
  const client = new DhcpClient(mac);

  // DISCOVER → OFFER
  const discover = client.start();
  const offerResp = server.handlePacket(discover);
  assert.equal(offerResp.action, "offer");

  // Клиент принимает OFFER
  const requestResp = client.handlePacket(offerResp.packet);
  assert.equal(requestResp.action, "request");

  // Сервер получает REQUEST → ACK
  const ackResp = server.handlePacket(requestResp.packet);
  assert.equal(ackResp.action, "ack");

  // Клиент получает ACK
  const boundResp = client.handlePacket(ackResp.packet);
  assert.equal(boundResp.action, "bound");
  assert.equal(client.state, "bound");
  assert.ok(client.assignedIp);
  assert.equal(client.domain, "test.local");
  assert.equal(client.leaseTime, 7200);

  const leases = server.getLeaseList();
  assert.equal(leases.length, 1);
  assert.equal(leases[0].mac, "02:11:22:33:44:55");
});

test("DhcpServer: REQUEST с неверным IP → NAK", () => {
  const server = new DhcpServer({ subnet: "10.42.0" });
  const mac = new Uint8Array(6);
  const badRequest = buildDhcpPacket({
    op: 1, xid: 1, chaddr: mac, dhcpType: DHCP_REQUEST,
    requestedIp: new Uint8Array([10, 99, 0, 99]),
  });
  const resp = server.handlePacket(badRequest);
  assert.equal(resp.action, "nak");
});

test("DhcpServer: RELEASE удаляет аренду", () => {
  const server = new DhcpServer({ subnet: "10.42.0" });
  server.setGateway(new Uint8Array([10, 42, 0, 1]));
  const mac = new Uint8Array([0x02, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
  const client = new DhcpClient(mac);
  const discover = client.start();
  const offerResp = server.handlePacket(discover);
  const requestResp = client.handlePacket(offerResp.packet);
  const ackResp = server.handlePacket(requestResp.packet);
  client.handlePacket(ackResp.packet);
  assert.equal(client.state, "bound");
  assert.equal(server.getLeaseList().length, 1);

  const release = buildDhcpPacket({
    op: 1, xid: 99, chaddr: mac, dhcpType: 7,
  });
  const releaseResp = server.handlePacket(release);
  assert.equal(releaseResp.action, "released");
  assert.equal(server.getLeaseList().length, 0);
});

// ─── switch.asm: компиляция ─────────────────────────────────────────────────
test("switch.asm: компилируется без ошибок", () => {
  const source = readFileSync("system/unix/bin/switch.asm", "utf-8");
  const asm = new Assembler();
  const program = asm.assemble(source);
  assert.ok(program.length > 0, "switch.asm должен содержать инструкции");
  const binary = asm.assembleBinary(source);
  assert.ok(binary.length > 0, "binary не должен быть пустым");
});

// ─── scanner.asm: компиляция ────────────────────────────────────────────────
test("scanner.asm: компилируется без ошибок", () => {
  const source = readFileSync("system/unix/bin/scanner.asm", "utf-8");
  const asm = new Assembler();
  const program = asm.assemble(source);
  assert.ok(program.length > 0, "scanner.asm должен содержать инструкции");
  assert.ok(program.featureFlags & 0x0001, "scanner.asm должен быть protected");
  const binary = asm.assembleBinary(source);
  assert.ok(binary.length > 0, "binary не должен быть пустым");
});

// ─── DhcpServer + network.js интеграция ─────────────────────────────────────
test("DhcpServer интегрируется с switchConfig из network.js", () => {
  const prop = new Propulsion();
  prop.install(makeItem("hull_hauler"));
  prop.slots.computer1.install(makeItem("nic_basic"));
  prop.install(makeItem("switch_8"), "computer2");
  autoWireNetwork(prop);
  dhcpAll(prop);

  const config = switchConfig(prop, prop.slots.computer2.instanceId
    ? `item:${prop.slots.computer2.instanceId}` : "computer2");
  const server = new DhcpServer(config);
  server.setGateway(new Uint8Array([10, 42, 0, 1]));

  const mac = new Uint8Array([0x02, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
  const client = new DhcpClient(mac);
  const discover = client.start();
  const resp = server.handlePacket(discover);
  assert.equal(resp.action, "offer");
});