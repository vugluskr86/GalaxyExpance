import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";
import { autoWireNetwork, configureScannerClient, configureSwitch, dhcpAll, httpRequest, networkAddressOptions, networkCommand, networkPath, networkTopology, remoteHttpRequest, scannerNetworkReadiness, switchConfig, tcpClose, tcpConnect, tcpSend, udpSend } from "../src/game/network.js";

function equippedNetwork(){
  const prop=new Propulsion();
  prop.install(makeItem("hull_hauler"));
  prop.slots.computer1.install(makeItem("nic_basic"));
  prop.install(makeItem("switch_8"),"computer2");
  assert.equal(prop.slots.computer2?.id,"switch_8");
  return prop;
}
test("ship network wires stable item nodes, leases DHCP and routes Ethernet",()=>{
  const prop=equippedNetwork(),first=networkTopology(prop),computer=first.nodes.find(node=>node.kind==="computer"),engine=first.nodes.find(node=>node.kind==="engine");
  assert.ok(computer&&engine);assert.equal(autoWireNetwork(prop).ok,true);
  assert.ok(dhcpAll(prop).every(item=>item.lease.ok));
  assert.ok(networkPath(prop,computer.id,engine.id)?.length>=3);
  assert.equal(udpSend(prop,computer.id,engine.id,{rpm:1}).ok,true);
  assert.ok(Object.keys(prop.network.macTables).length>0);
});
test("scanner GUI client receives scanner and antenna telemetry only through configured DHCP routes",()=>{
  const prop=equippedNetwork();assert.equal(autoWireNetwork(prop).ok,true);dhcpAll(prop);
  const {nodes}=networkTopology(prop),computer=nodes.find(node=>node.kind==="computer"),scanner=nodes.find(node=>node.kind==="scanner"),antenna=nodes.find(node=>node.kind==="antenna"),sw=nodes.find(node=>node.kind==="switch");
  assert.ok(computer&&scanner&&antenna&&sw);
  assert.equal(scannerNetworkReadiness(prop,computer.item.instanceId).ok,false,"addresses are explicit GUI configuration");
  configureScannerClient(prop,computer.item.instanceId,{scannerAddress:prop.network.addresses[scanner.id],antennaAddress:prop.network.addresses[antenna.id]});
  const ready=scannerNetworkReadiness(prop,computer.item.instanceId);
  assert.equal(ready.ok,true);assert.equal(ready.scannerStatus.range,prop.scanner.stats.range);assert.equal(ready.antennaStatus.powered,true);
  assert.ok(prop.network.frames.filter(frame=>frame.payload?.service).length>=2);
  assert.equal(networkAddressOptions(prop,{kind:"scanner"})[0].address,prop.network.addresses[scanner.id]);
  assert.equal(configureSwitch(prop,sw.id,{dhcpEnabled:false}).ok,true);
  assert.equal(dhcpAll(prop).some(item=>item.lease.reason==="dhcp-disabled"),true);
  assert.equal(switchConfig(prop,sw.id).dhcpEnabled,false);
});
test("HTTP automation is topology-gated and cannot bypass weapon readiness",()=>{
  const prop=equippedNetwork();autoWireNetwork(prop);dhcpAll(prop);
  const computer=networkTopology(prop).nodes.find(node=>node.kind==="computer");
  const changed=httpRequest(prop,computer.id,"engine","/throttle","POST",{value:4});
  assert.equal(changed.ok,true);assert.equal(prop.throttle,1);
  const lines=networkCommand(prop,"curl engine/status");assert.match(lines[0],/throttle/);
});
test("TCP connections are bounded, deliver only over a route and can close",()=>{
  const prop=equippedNetwork();autoWireNetwork(prop);dhcpAll(prop);
  const nodes=networkTopology(prop).nodes,computer=nodes.find(node=>node.kind==="computer"),engine=nodes.find(node=>node.kind==="engine");
  const socket=tcpConnect(prop,computer.id,engine.id);assert.equal(socket.state,"established");
  assert.equal(tcpSend(prop,socket.id,{safe:true}).ok,true);assert.equal(tcpClose(prop,socket.id),true);
  assert.equal(tcpSend(prop,socket.id,{}).reason,"closed");
});
test("radio routing requires both antennas and reuses the remote cable gate",()=>{
  const local=equippedNetwork(),remote=equippedNetwork();autoWireNetwork(local);autoWireNetwork(remote);dhcpAll(local);dhcpAll(remote);
  const controller=networkTopology(local).nodes.find(node=>node.kind==="computer");
  const result=remoteHttpRequest(local,remote,20,controller.id,"engine","/throttle","POST",{value:.4});
  assert.equal(result.ok,true);assert.equal(remote.throttle,.4);
  remote.slots.antenna=null;assert.equal(remoteHttpRequest(local,remote,20,controller.id,"engine").ok,false);
});
