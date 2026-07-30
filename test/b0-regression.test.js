import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { FloatingItem } from "../src/game/inventory.js";
import { Ship } from "../src/game/ship.js";
import { landedBodyRef, restoreFloatingItems, restoreShip, snapshotFloatingItems, snapshotShip } from "../src/game/savegame.js";
import { SystemScene } from "../src/scenes/system.js";

test("a landed ship restores its body reference instead of a stale selection",()=>{
  const landed={kind:"planet",i:2,j:0};
  const physicsScene={S:{sun:{D:100}}};
  const before=new Ship(physicsScene,"#ffd166");before.land(landed);
  const after=new Ship(physicsScene,"#ffd166");restoreShip(after,snapshotShip(before));
  assert.equal(after.mode,"landed");
  assert.deepEqual(landedBodyRef(after),landed);
});

test("floating cargo preserves its physics and hidden surface discovery state",()=>{
  const floating=new FloatingItem(makeItem("ore_fe"),{kind:"planet",i:1,j:0},7,-3,.2,-.4);
  floating.spin=1.25;floating.landed={kind:"planet",i:1,j:0};floating.discovered=false;
  const restored=restoreFloatingItems(snapshotFloatingItems([floating]))[0];
  assert.equal(restored.item.id,"ore_fe");
  assert.equal(restored.rx,7);assert.equal(restored.ry,-3);
  assert.equal(restored.rvx,.2);assert.equal(restored.rvy,-.4);
  assert.equal(restored.spin,1.25);assert.equal(restored.discovered,false);
  assert.deepEqual(restored.landed,{kind:"planet",i:1,j:0});
});

test("old cargo saves keep space cargo visible and keep surface cargo hidden",()=>{
  const space={item:{id:"ore_fe",qty:1},primary:{kind:"star",i:0,j:0},rx:1,ry:2,rvx:0,rvy:0};
  const surface={...space,landed:{kind:"planet",i:0,j:0}};
  assert.equal(restoreFloatingItems([space])[0].discovered,true);
  assert.equal(restoreFloatingItems([surface])[0].discovered,false);
});

test("the system action offers takeoff for a restored landed ship",()=>{
  let takeoffHeight=null,changed=0;
  const scene={S:{bhOnly:false},orbitAlt:18,world:null,mgr:{onChange:()=>{changed++;}},playerShip:{
    mode:"landed",takeoff(_scene,height){takeoffHeight=height;this.mode="newton";return true;}
  }};
  const action=SystemScene.prototype.primary.call(scene);
  action.run();
  assert.equal(takeoffHeight,18);assert.equal(changed,1);
});
