import test from "node:test";
import assert from "node:assert/strict";
import { EffectPool, EFFECT_CAPS } from "../src/game/effects.js";
import { OutfitScene } from "../src/scenes/outfit.js";
import { Propulsion } from "../src/game/propulsion.js";
import { makeItem } from "../src/game/items.js";

test("effect pool is deterministic and bounded at every LOD",()=>{
  for(let lod=0;lod<3;lod++){
    const left=new EffectPool(77),right=new EffectPool(77);
    for(let i=0;i<100;i++){left.emit("laser",i,0,{count:8},lod);right.emit("laser",i,0,{count:8},lod);}
    assert.ok(left.particles.length<=EFFECT_CAPS[lod]);assert.deepEqual(left.particles,right.particles);
    left.update(.1);assert.ok(left.particles.length<=EFFECT_CAPS[lod]);
  }
});
test("outfit lists filter and paginate without changing the ship state",()=>{
  const prop=new Propulsion();
  for(let i=0;i<8;i++)prop.inventory.add(makeItem(i%2?"wpn_laser":"eng_lite"));
  const scene=new OutfitScene({playerShip:{prop}});
  const before=prop.inventory.items.length;scene.inventoryFilter="weapons";
  const view=scene.pageOf(scene.filtered(prop.inventory.items),"inventory");
  assert.equal(view.total,5);assert.equal(view.items.length,5);
  scene.inventoryFilter="all";const all=scene.pageOf(scene.filtered(prop.inventory.items),"inventory");
  assert.ok(all.pages>1);assert.equal(prop.inventory.items.length,before);
});
