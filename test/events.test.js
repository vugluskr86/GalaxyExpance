import test from "node:test";
import assert from "node:assert/strict";
import { WorldSave } from "../src/game/savegame.js";
import { Propulsion } from "../src/game/propulsion.js";
import { makeItem } from "../src/game/items.js";
import { marketQuote } from "../src/game/economy.js";
import { advanceWorldEvents, eventAt, recordEventCombat, resolveWorldEvent, startWorldEvent, systemControl } from "../src/game/events.js";

const settlement={id:"sys-pressure/planet-0",factionId:"frontier",specialization:"agri",security:.6,population:.7,techLevel:2};
const context={settlement,body:{id:settlement.id,dist:140}};

test("a saved global event changes prices, stock and can be resolved by real cargo",()=>{
  const world=new WorldSave({clusterSeed:444});
  const normal=marketQuote(world,settlement.id,"food",context).buyPrice;
  const event=startWorldEvent(world,settlement.id,settlement,"blockade",.7,1);
  assert.ok(marketQuote(world,settlement.id,"food",context).buyPrice>normal,"blockade raises food price");
  const prop=new Propulsion();prop.cargo.add(makeItem("cargo_food",8));
  const outcome=resolveWorldEvent(world,settlement.id,context,prop,"delivery");
  assert.equal(outcome.ok,true);assert.equal(eventAt(world,settlement.id),null);
  assert.ok(world.data.economy.events.news.some(entry=>entry.type==="resolved"));
});

test("known markets advance events and system control on discrete days",()=>{
  const world=new WorldSave({clusterSeed:445});
  const second={...settlement,id:"sys-pressure/planet-1",specialization:"mining",security:.4};
  marketQuote(world,settlement.id,"food",context);
  marketQuote(world,second.id,"ore",{settlement:second,body:{id:second.id,dist:360}});
  advanceWorldEvents(world,3);
  const control=systemControl(world,"sys-pressure");
  assert.equal(world.data.economy.events.lastDay,3);
  assert.equal(control.factionId,"frontier");assert.ok(control.defense>=0&&control.defense<=100);
});

test("destroying a pirate resolves an active raid through the shared event state",()=>{
  const world=new WorldSave({clusterSeed:446});
  startWorldEvent(world,settlement.id,settlement,"pirateRaid",.8,2);
  assert.equal(recordEventCombat(world,settlement.id,context),true);
  assert.equal(eventAt(world,settlement.id),null);
  assert.ok(world.data.economy.events.news.some(entry=>entry.action==="combat"));
});
