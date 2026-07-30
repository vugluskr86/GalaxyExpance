import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "../src/game/agents.js";
import { WorldSave } from "../src/game/savegame.js";
import { Propulsion } from "../src/game/propulsion.js";
import { makeItem } from "../src/game/items.js";
import { initializeNpcEconomy, onNpcDestroyed, updateNpcEconomy, valuableRaidTarget } from "../src/game/npc-economy.js";
import { GOODS, marketQuote } from "../src/game/economy.js";

const settlement=(id,specialization)=>({id,factionId:"frontier",specialization,security:.5,population:.6,techLevel:2});
const vessel=(primary={kind:"planet",i:0,j:0})=>({
  primary,mode:"newton",integrity:100,prop:new Propulsion(),
  fsdTo(target){this.target={...target};this.mode="cruise";},globPos(){return [this.primary.i*30,0];}
});

test("trader route loads a real crate then delivers it into destination stock",()=>{
  const world=new WorldSave({clusterSeed:901});
  const origin={settlement:settlement("farm","agri"),dist:120,moonList:[]};
  const destination={settlement:settlement("mine","mining"),dist:480,moonList:[]};
  const ship=vessel(),agent=new AgentController("trader",{},7),npc={ship,agent};
  const sys={world,S:{planets:[origin,destination]},npcs:[npc]};
  initializeNpcEconomy(sys);
  const route=npc.economy;
  assert.equal(route.kind,"trade");
  ship.primary={...route.originRef};ship.mode="newton";
  assert.equal(updateNpcEconomy(npc,sys),true);
  // The optimal route depends on current market quotes, so verify the actual
  // commodity selected by the route instead of assuming agricultural cargo.
  const itemId=GOODS.find(good=>good.id===route.goodId).itemId;
  assert.equal(ship.prop.cargo.count(itemId),route.quantity);
  const before=marketQuote(world,route.destinationId,route.goodId,{settlement:destination.settlement,body:destination}).stock;
  ship.primary={...route.destinationRef};ship.mode="newton";
  assert.equal(updateNpcEconomy(npc,sys),true);
  assert.equal(route.state,"complete");
  assert.equal(marketQuote(world,route.destinationId,route.goodId,{settlement:destination.settlement,body:destination}).stock,before+route.quantity);
});

test("pirates prefer valuable weak cargo and lost haulers deepen destination shortage",()=>{
  const world=new WorldSave({clusterSeed:902});
  const destination={settlement:settlement("dest","mining"),dist:400,moonList:[]};
  const pirate={ship:vessel(),agent:new AgentController("pirate",{},2)};
  const rich={ship:vessel({kind:"planet",i:1,j:0}),agent:new AgentController("trader",{},3)};
  rich.ship.prop.cargo.add(makeItem("ore_pt",4));rich.ship.integrity=30;
  const poor={ship:vessel({kind:"planet",i:0,j:0}),agent:new AgentController("trader",{},4)};
  const sys={world,S:{planets:[{settlement:settlement("farm","agri"),dist:100,moonList:[]},destination]},npcs:[pirate,rich,poor],playerShip:null};
  assert.equal(valuableRaidTarget(pirate,sys),rich.ship);
  rich.economy={kind:"trade",state:"toDestination",destinationId:"dest",destinationRef:{kind:"planet",i:1,j:0},goodId:"food",quantity:6};
  const before=marketQuote(world,"dest","food",{settlement:destination.settlement,body:destination}).stock;
  onNpcDestroyed(rich,sys);
  assert.ok(marketQuote(world,"dest","food",{settlement:destination.settlement,body:destination}).stock<before);
});
