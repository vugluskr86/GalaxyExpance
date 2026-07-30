import test from "node:test";
import assert from "node:assert/strict";
import { Propulsion } from "../src/game/propulsion.js";
import { CATALOG, makeItem } from "../src/game/items.js";
import { GOODS } from "../src/game/economy.js";
import { mineRock, scanRock } from "../src/game/mining.js";
import { launchProbe, updateProbes, deliverProbeReports } from "../src/game/probes.js";

test("hyperjump needs fitted drive, charged capacitor and antimatter",()=>{
  const p=new Propulsion();p.install(makeItem("hyper_s"));p.install(makeItem("cap_s"));
  assert.equal(p.hyperjumpStatus(20).reason,"energy");p.energy=20;
  assert.equal(p.hyperjumpStatus(20).reason,"antimatter");p.cargo.add(makeItem("antimatter",1));
  assert.equal(p.consumeHyperjump(20).ok,true);assert.ok(p.energy<20);
});
test("hull hardpoints reject incompatible hyperdrive and miner modules",()=>{
  const p=new Propulsion();const scout=makeItem("hull_scout");p.install(scout);
  assert.equal(p.install(makeItem("hyper_s")),null);assert.equal(p.install(makeItem("miner_basic")),null);
});
test("mining changes a finite deposit only after capacity checks",()=>{
  const p=new Propulsion();p.install(makeItem("miner_basic"));
  const scene={playerShip:{prop:p},S:{belt:{rocks:[{deposit:{resourceId:"ore_fe",remaining:3,richness:1}}]}}};
  assert.equal(mineRock(scene,0,8).reason,"unscanned");assert.equal(scanRock(scene,0).ok,true);
  const got=mineRock(scene,0,8);assert.equal(got.ok,true);assert.equal(scene.S.belt.rocks[0].deposit.remaining,1);
});
test("probes wait for their mission and then require an antenna to deliver",()=>{
  const p=new Propulsion();p.cargo.add(makeItem("probe_space"));
  const scene={playerShip:{prop:p},S:{seed:42},probes:[]};assert.equal(launchProbe(scene,"space",{kind:"rock",i:0,j:0}).ok,true);
  updateProbes(scene,30);p.slots.antenna=null;assert.equal(deliverProbeReports(scene).length,0);
  p.slots.antenna=makeItem("antenna_mid");assert.equal(deliverProbeReports(scene).length,1);
});
test("mined minerals, metals and gases are real market goods",()=>{
  assert.equal(CATALOG.filter(item=>item.id.startsWith("min_")).length,10);
  assert.equal(CATALOG.filter(item=>item.id.startsWith("ore_")).length,10);
  assert.equal(CATALOG.filter(item=>item.id.startsWith("gas_")).length,10);
  assert.ok(GOODS.some(good=>good.itemId==="ore_zn")&&GOODS.some(good=>good.itemId==="gas_xe"));
});
