import test from "node:test";
import assert from "node:assert/strict";
import { WorldSave, loadWorld } from "../src/game/savegame.js";
import { makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";
import { baseMarket, buyGoods, changeCredits, changeReputation, changeStock, economicDay, economicTick, ensureEconomy, landingAccess, marketAccess, marketProfileFor, marketQuote, productionFor, reputationFor, resolveBlackMarketRisk, sellGoods } from "../src/game/economy.js";
import { acceptContract, advanceContracts, completeContract, contractsAt, contractsForSystem, generateContracts } from "../src/game/contracts.js";

const location="sys-demo/planet-0";

test("base markets are deterministic for the same universe seed and location",()=>{
  const first=new WorldSave({clusterSeed:731});
  const second=new WorldSave({clusterSeed:731});
  assert.deepEqual(baseMarket(first,location),baseMarket(second,location));
  assert.deepEqual(marketQuote(first,location,"food"),marketQuote(second,location,"food"));
});

test("market deltas and the transaction journal survive save and reload",()=>{
  const store=new Map();
  const storage={setItem:(key,value)=>store.set(key,value),getItem:key=>store.get(key)??null};
  const world=new WorldSave({clusterSeed:91});
  const before=marketQuote(world,location,"ore");
  assert.equal(changeStock(world,location,"ore",-7),-7);
  const transaction=changeCredits(world,-300,{kind:"trade",locationId:location,goodId:"ore",quantity:2});
  assert.equal(transaction.amount,-300);
  world.persist(storage);
  const restored=loadWorld(storage);
  const after=marketQuote(restored,location,"ore");
  assert.equal(after.stock,before.stock-7);
  assert.equal(ensureEconomy(restored).credits,2200);
  assert.equal(ensureEconomy(restored).transactions.at(-1).kind,"trade");
});

test("economic ticks advance complete days once and are independent of frame count",()=>{
  const world=new WorldSave({clusterSeed:17});
  marketQuote(world,location,"water");
  assert.equal(economicTick(world,4),4);
  const stockAfterFour=marketQuote(world,location,"water").stock;
  assert.equal(economicTick(world,4),4);
  assert.equal(marketQuote(world,location,"water").stock,stockAfterFour);
  assert.equal(economicDay(world),4);
});

test("settlement specialization creates visibly different production markets",()=>{
  const world=new WorldSave({clusterSeed:2026});
  const agri={settlement:{specialization:"agri",security:.7,population:.5},body:{dist:250}};
  const mining={settlement:{specialization:"mining",security:.7,population:.5},body:{dist:250}};
  const foodAtFarm=marketQuote(world,"farm", "food",agri);
  const foodAtMine=marketQuote(world,"mine", "food",mining);
  const oreAtFarm=marketQuote(world,"farm", "ore",agri);
  const oreAtMine=marketQuote(world,"mine", "ore",mining);
  assert.ok(foodAtFarm.stock>foodAtMine.stock,"farm exports food");
  assert.ok(oreAtMine.stock>oreAtFarm.stock,"mine exports ore");
});

test("surface resources and technology deterministically affect local production",()=>{
  const ore={id:"ore",category:"industrial",producedBy:["mining"],consumedBy:[]};
  const rich=marketProfileFor({specialization:"mining",population:.6,techLevel:4},{surface:{minerals:.9}});
  const poor=marketProfileFor({specialization:"mining",population:.6,techLevel:1},{surface:{minerals:.1}});
  assert.ok(productionFor(ore,rich)>productionFor(ore,poor));
  assert.equal(productionFor(ore,rich),productionFor(ore,marketProfileFor({specialization:"mining",population:.6,techLevel:4},{surface:{minerals:.9}})));
});

test("buy and sell move real cargo, credits, stock and market price together",()=>{
  const world=new WorldSave({clusterSeed:404});
  const prop=new Propulsion();
  const context={settlement:{specialization:"agri",security:.8,population:.6},body:{dist:120}};
  const location="farm";
  const before=marketQuote(world,location,"food",context);
  const bought=buyGoods(world,location,context,prop,"food",3);
  assert.equal(bought.ok,true);assert.equal(prop.cargo.count("cargo_food"),3);
  assert.equal(marketQuote(world,location,"food",context).stock,before.stock-3);
  prop.cargo.add(makeItem("cargo_food",12));
  const priceBeforeSale=marketQuote(world,location,"food",context).finalPrice;
  const sold=sellGoods(world,location,context,prop,"food",10);
  assert.equal(sold.ok,true);
  assert.ok(marketQuote(world,location,"food",context).finalPrice<priceBeforeSale,"large sale lowers local price");
  assert.equal(ensureEconomy(world).transactions.at(-1).kind,"market-sell");
});

test("settlement, faction and career reputation are independent and persist",()=>{
  const world=new WorldSave({clusterSeed:81});
  const a={settlement:{id:"a",factionId:"concord",specialization:"agri"},body:{dist:100}};
  const b={settlement:{id:"b",factionId:"guild",specialization:"mining"},body:{dist:100}};
  changeReputation(world,a,{settlement:10,faction:12,careers:{merchant:4}},"delivery");
  assert.equal(reputationFor(world,a).settlement,10);
  assert.equal(reputationFor(world,a).faction,12);
  assert.equal(reputationFor(world,b).settlement,0,"planet standing is local");
  assert.equal(reputationFor(world,b).faction,0,"faction standing is separate");
  assert.equal(reputationFor(world,b).careers.merchant,4,"career is global");
});

test("controlled cargo needs a license while black market has separate access",()=>{
  const world=new WorldSave({clusterSeed:82});
  const lawful={settlement:{id:"law",factionId:"concord",government:"republic",specialization:"military",security:.8},body:{dist:50}};
  assert.equal(marketAccess(world,lawful,"arms").reason,"license");
  changeReputation(world,lawful,{faction:16},"licensed service");
  assert.equal(marketAccess(world,lawful,"arms").ok,true);
  assert.equal(marketAccess(world,lawful,"contraband").reason,"illegal");
  const black={settlement:{id:"free",factionId:"frontier",government:"freeport",blackMarket:true,specialization:"mining",security:1},body:{dist:50},marketKind:"black"};
  assert.equal(marketAccess(world,black,"contraband","black").ok,true);
});

test("deterministic contraband inspection confiscates cargo and changes trust",()=>{
  const world=new WorldSave({clusterSeed:83});
  const prop=new Propulsion();prop.cargo.add(makeItem("cargo_contraband",2));
  const context={settlement:{id:"raid",factionId:"concord",blackMarket:true,specialization:"mining",security:1},body:{dist:100},marketKind:"black"};
  /* Find a saved sequence which deterministically produces the inspection;
     the loop is not random and protects the test from seed changes. */
  let result;for(let seq=0;seq<100;seq++){ensureEconomy(world).transactionSeq=seq;result=resolveBlackMarketRisk(world,context,prop,"contraband",1);if(result.caught)break;}
  assert.equal(result.caught,true);
  assert.equal(prop.cargo.count("cargo_contraband"),1);
  assert.ok(reputationFor(world,context).faction<0);
});

test("contracts arise from shortage, complete with real cargo and pay reputation",()=>{
  const world=new WorldSave({clusterSeed:84});
  const prop=new Propulsion();
  const context={settlement:{id:"relief",factionId:"concord",specialization:"mining",security:.35,population:.8,techLevel:4,blackMarket:true,event:{id:"shortage",priceModifiers:{food:1.3}}},body:{dist:500}};
  const offers=generateContracts(world,"relief",context);
  const delivery=offers.find(contract=>contract.type==="delivery");
  assert.ok(delivery,"a market shortage offers a delivery");
  assert.equal(acceptContract(world,delivery.id).ok,true);
  const need=delivery.cargo[0];
  const good={food:"cargo_food",water:"cargo_water",medicine:"cargo_medicine",ore:"ore_fe",rareMinerals:"ore_pt",fuel:"cargo_fuel",electronics:"cargo_electronics",components:"cargo_components",arms:"cargo_arms",luxury:"cargo_luxury",data:"cargo_data",contraband:"cargo_contraband"}[need.goodId];
  prop.cargo.add(makeItem(good,need.amount));
  const credits=ensureEconomy(world).credits;
  assert.equal(completeContract(world,delivery.id,"relief",context,prop).ok,true);
  assert.equal(prop.cargo.count(good),0);
  assert.ok(ensureEconomy(world).credits>credits);
  assert.equal(contractsAt(world,"relief").some(contract=>contract.id===delivery.id),false);
});

test("ignored offers can be claimed and expired active contracts fail on economic days",()=>{
  const world=new WorldSave({clusterSeed:85});
  const context={settlement:{id:"deadline",factionId:"guild",specialization:"agri",security:.2,population:.7,techLevel:1,blackMarket:false,event:{id:"shortage"}},body:{dist:200}};
  const delivery=generateContracts(world,"deadline",context).find(contract=>contract.type==="delivery");
  acceptContract(world,delivery.id);
  advanceContracts(world,delivery.deadline+1);
  assert.equal(delivery.state,"failed");
  const offered=generateContracts(world,"deadline",context).find(contract=>contract.state==="offered");
  for(let day=2;day<30&&offered.state==="offered";day++)advanceContracts(world,day);
  assert.ok(["offered","claimed"].includes(offered.state));
});

test("galaxy route markers expose accepted public contracts only",()=>{
  const world=new WorldSave({clusterSeed:86});
  ensureEconomy(world).contracts={sequence:4,items:[
    {id:"active",state:"active",visibility:"public",issuerId:"sys-a/planet-0",destinationId:"sys-b/planet-0"},
    {id:"offer",state:"offered",visibility:"public",issuerId:"sys-a/planet-1",destinationId:"sys-c/planet-0"},
    {id:"black",state:"active",visibility:"black-market",issuerId:"sys-a/planet-2",destinationId:"sys-d/planet-0"},
  ]};
  assert.deepEqual(contractsForSystem(world,"sys-a").map(contract=>contract.id),["active"]);
  assert.deepEqual(contractsForSystem(world,"sys-b").map(contract=>contract.id),["active"]);
});
