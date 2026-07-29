import test from "node:test";
import assert from "node:assert/strict";
import { SystemScene } from "../src/scenes/system.js";

test("NPC lock hit-test and follow order steer toward the locked ship",()=>{
  const targetShip={destroyed:false,primary:{kind:"planet",i:0,j:0},globPos:()=>[40,20]};
  const target={ship:targetShip};
  const player={
    mode:"newton",primary:{kind:"planet",i:0,j:0},nose:0,ctrl:{thrust:false},
    prop:{throttle:0,activeWeapon:null},globPos:()=>[0,0],sameTarget:()=>true
  };
  const scene={npcs:[target],playerShip:player,playerOrder:{mode:"follow",target,distance:22},ssx:x=>x,ssy:y=>y};
  assert.equal(SystemScene.prototype.hitNpcAt.call(scene,40,20),target);
  SystemScene.prototype.updatePlayerOrder.call(scene);
  assert.ok(player.ctrl.thrust);
  assert.ok(player.prop.throttle>0);
  assert.ok(player.nose>0);
});

test("target lock panel reads the player hardpoints without leaking the local propulsion variable",()=>{
  const prop={
    mass:10,dryMass:8,fuel:2,tank:{fuel:4,id:"tank_m"},engine:{thrust:10,isp:100,id:"eng_main"},
    accelFullMs:1,deltaV:20,throttle:0,slotDefs:[{id:"weapon1"}],
    slots:{weapon1:{name:"Laser"}},activeWeaponSlot:"weapon1",scoop:null,cargoMass:0,cargoCap:1,
    twr:()=>1,setEngine:()=>{},setTank:()=>{},refuel:()=>{}
  };
  const player={mode:"cruise",primary:{kind:"planet",i:0,j:0},sas:"off",prop};
  const scene={S:{bhOnly:false,planets:[]},playerShip:player,lockedNpc:{name:"Opponent"},playerOrder:null,orbitAlt:20,follow:false,followShip:false};
  const panel=SystemScene.prototype.panelSpec.call(scene);
  assert.ok(panel.some(item=>item.kind==="sect"&&item.label.includes("Opponent")));
  assert.ok(panel.some(item=>item.kind==="action"&&item.label.includes("Огонь")));
});
