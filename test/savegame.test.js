import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { WorldSave, snapshotItem, restoreItem } from "../src/game/savegame.js";

test("world save round-trips mutable installed-item state and browser storage payload",()=>{
  const weapon=makeItem("wpn_missile");weapon.ammoLeft=3;weapon.cooldownLeft=.4;
  const restored=restoreItem(snapshotItem(weapon));
  assert.equal(restored.id,"wpn_missile");
  assert.equal(restored.ammoLeft,3);
  assert.equal(restored.cooldownLeft,.4);
  const store={value:null,setItem(key,value){this.key=key;this.value=value;}};
  const save=new WorldSave({clusterSeed:123,galaxyIndex:4});
  assert.equal(save.persist(store),true);
  assert.equal(JSON.parse(store.value).clusterSeed,123);
});
