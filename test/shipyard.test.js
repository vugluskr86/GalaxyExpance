import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { restoreItem, snapshotItem } from "../src/game/savegame.js";
import { makeBuiltinShipyardHull, shipyardBindings, shipyardPngSize, shipyardSlotToPng, validateShipyardData } from "../src/game/shipyard.js";

const ship=()=>({format:"pixel-shipyard/v1",seed:1337,algorithm:"ca",palette:"steel",
  image:{gridWidth:34,gridHeight:46,scale:8,crop:true,bounds:{x0:3,y0:1,x1:30,y1:44}},stats:{hull:412},parameters:{},slots:[
    {id:"engine-0",type:"engine",x:9,y:43,rotation:180,mount:"rear"},
    {id:"weapon-0",type:"weapon",x:2,y:13,rotation:0,mount:"left"},
    {id:"cockpit-0",type:"cockpit",x:17,y:8,rotation:0,mount:"internal"},
    {id:"center-0",type:"utility",x:17,y:23,rotation:0,mount:"center"}
  ]});

test("shipyard cropped coordinates follow the v1 PNG formula",()=>{
  const data=validateShipyardData(ship());
  const point=shipyardSlotToPng(data.slots[0],data.image);
  assert.deepEqual(point,{x:56,y:344,centerX:60,centerY:348});
  assert.deepEqual(shipyardPngSize(data.image),{width:240,height:368});
});

test("shipyard mounts map deterministically to current equipment slots",()=>{
  const bindings=shipyardBindings(validateShipyardData(ship()));
  assert.deepEqual(bindings.map(binding=>binding.gameSlot),["engine","weapon1","computer","hull"]);
});

test("each stock hull receives a deterministic generated pixel raster",()=>{
  const first=makeBuiltinShipyardHull("hull_std",{hullInt:340,weaponSlots:2});
  const same=makeBuiltinShipyardHull("hull_std",{hullInt:340,weaponSlots:2});
  assert.deepEqual(first.raster,same.raster);
  assert.equal(first.raster.length,first.image.gridHeight);
  assert.equal(first.raster[0].length,first.image.gridWidth);
  assert.equal(first.slots.filter(slot=>slot.type==="weapon").length,2);
  for(const slot of first.slots)
    assert.notEqual(first.raster[slot.y][slot.x],".",`${slot.id} is attached to the hull`);
});

test("shipyard import rejects duplicate and out-of-grid mount data",()=>{
  const duplicated=ship();duplicated.slots.push({...duplicated.slots[0]});
  assert.throws(()=>validateShipyardData(duplicated),/Duplicate/);
  const outside=ship();outside.slots[0].x=34;
  assert.throws(()=>validateShipyardData(outside),/out-of-grid/);
});

test("custom hull payload persists with an item",()=>{
  const hull=makeItem("hull_std");hull.shipyard={...validateShipyardData(ship()),pngDataUrl:"data:image/png;base64,AA=="};
  const restored=restoreItem(snapshotItem(hull));
  assert.equal(restored.shipyard.seed,1337);
  assert.equal(restored.shipyard.pngDataUrl,"data:image/png;base64,AA==");
});
