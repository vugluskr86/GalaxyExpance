import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";
import { restoreItem, snapshotItem } from "../src/game/savegame.js";
import { communicationStatus, scannerStatus } from "../src/game/equipment.js";

test("hulls expose zero, one and five terminal/computer mounts",()=>{
  const scout=new Propulsion();scout.install(makeItem("hull_scout"));
  const standard=new Propulsion();
  const carrier=new Propulsion();carrier.install(makeItem("hull_carrier"));
  assert.equal(scout.slotDefs.filter(slot=>slot.id.startsWith("computer")).length,0);
  assert.equal(standard.slotDefs.filter(slot=>slot.id.startsWith("terminal")).length,1);
  assert.equal(carrier.slotDefs.filter(slot=>slot.id.startsWith("computer")).length,5);
  assert.equal(carrier.slotDefs.filter(slot=>slot.id.startsWith("terminal")).length,5);
});

test("terminal cable is one-to-one and survives an item save",()=>{
  const prop=new Propulsion();
  const spare=makeItem("term_graphics");
  assert.equal(prop.install(spare,"terminal1").id,"term_basic");
  assert.equal(prop.slots.terminal1,spare);
  assert.equal(prop.connectTerminal("terminal1","computer1"),true);
  assert.equal(prop.connectTerminal("terminal1","computer1"),true);
  const saved=snapshotItem(prop.slots.terminal1),restored=restoreItem(saved);
  assert.equal(restored.connectedComputerId,prop.slots.computer1.instanceId);
});

test("communications and scanning report no hardware, distance and usable tiers",()=>{
  const prop=new Propulsion();
  prop.slots.antenna=null;assert.equal(communicationStatus(prop,1).reason,"no-antenna");
  prop.slots.antenna=makeItem("antenna_mid");
  assert.equal(communicationStatus(prop,999).reason,"out-of-range");
  assert.equal(communicationStatus(prop,10).ok,true);
  prop.slots.scanner=null;assert.equal(scannerStatus(prop,1).reason,"no-scanner");
  prop.slots.scanner=makeItem("scanner_deep");assert.equal(scannerStatus(prop,10).resolution,3);
});

test("overload includes hand inventory and prevents acceleration",()=>{
  const prop=new Propulsion();prop.inventory.add(makeItem("hull_dreadnought"));prop.throttle=1;
  assert.equal(prop.overloadStatus().overloaded,true);
  assert.equal(prop.accel(),0);
});
