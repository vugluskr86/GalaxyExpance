import test from "node:test";
import assert from "node:assert/strict";
import { bySlot, makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";

test("thirteen hulls expose the requested varied subsystem and weapon hardpoints",()=>{
  const hulls=bySlot("hull");
  assert.equal(hulls.length,13);
  assert.equal(hulls.filter(h=>h.stats.scoopSlot===false).length,1);
  assert.equal(hulls.filter(h=>h.stats.shieldSlot===false).length,3);
  assert.equal(hulls.filter(h=>h.stats.droidSlot===false).length,2);
  assert.deepEqual(new Set(hulls.map(h=>h.stats.weaponSlots)),new Set([1,2,3,4,5]));
});

test("shield, repair and five weapon slots are constrained by the installed hull",()=>{
  const prop=new Propulsion();
  prop.install(makeItem("hull_frigate"));
  assert.equal(prop.slotDefs.filter(slot=>slot.id.startsWith("weapon")).length,5);
  assert.equal(prop.install(makeItem("shield_l")),null);
  prop.tickSystems(1);
  assert.equal(prop.shield.charge,prop.shield.stats.capacity);
  for(let i=1;i<=5;i++)assert.equal(prop.install(makeItem("wpn_laser"),`weapon${i}`),null);
  assert.equal(prop.weapons.length,5);
});
