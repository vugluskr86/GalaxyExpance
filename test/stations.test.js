import test from "node:test";
import assert from "node:assert/strict";
import { WorldSave } from "../src/game/savegame.js";
import { Propulsion } from "../src/game/propulsion.js";
import { changeReputation, ensureEconomy } from "../src/game/economy.js";
import { buyMilitaryLicense, buyProbeAtStation, hasLicense, installStationModule, repairAtStation, stationsForSettlement, surveyAtStation } from "../src/game/stations.js";

const settlement={id:"sys-station/planet-0",factionId:"frontier",government:"freeport",specialization:"military",techLevel:4,security:.86,population:.8,blackMarket:true};
const context={settlement,body:{id:settlement.id,dist:220,type:"terran"}};

test("station directory is deterministic and exposes specialised services only where appropriate",()=>{
  const first=stationsForSettlement(settlement,{systemId:"sys-station",planetIndex:0});
  const second=stationsForSettlement({...settlement},{systemId:"sys-station",planetIndex:0});
  assert.deepEqual(first,second);
  assert.deepEqual(first.map(station=>station.kind),["trade","shipyard","military","science","medical","pirate"]);
  const farm=stationsForSettlement({...settlement,id:"sys-station/planet-1",specialization:"agri",techLevel:1,security:.2,population:.2,blackMarket:false},{systemId:"sys-station",planetIndex:1});
  assert.deepEqual(farm.map(station=>station.kind),["trade","medical"]);
});

test("shipyard repairs damage and installs ordinary modules through the credit journal",()=>{
  const world=new WorldSave({clusterSeed:99,player:{credits:2_000_000}});
  const ship={prop:new Propulsion(),integrity:140};
  const shipyard=stationsForSettlement(settlement,{systemId:"sys-station"}).find(station=>station.kind==="shipyard");
  const repaired=repairAtStation(world,shipyard,context,ship);
  assert.equal(repaired.ok,true);assert.equal(ship.integrity,ship.prop.slots.hull.stats.hullInt);
  const installed=installStationModule(world,shipyard,context,ship,"eng_lite");
  assert.equal(installed.ok,true);assert.equal(ship.prop.slots.engine.id,"eng_lite");
  assert.equal(ensureEconomy(world).transactions.at(-1).kind,"station-install");
});

test("military clearance gates rare military equipment and science surveys persist",()=>{
  const world=new WorldSave({clusterSeed:100,player:{credits:5_000_000}});
  const ship={prop:new Propulsion(),integrity:340};
  const stations=stationsForSettlement(settlement,{systemId:"sys-station"});
  const military=stations.find(station=>station.kind==="military"),science=stations.find(station=>station.kind==="science");
  assert.equal(installStationModule(world,military,context,ship,"wpn_torpedo").reason,"restricted");
  changeReputation(world,context,{faction:12,careers:{protector:12}},"service record");
  assert.equal(buyMilitaryLicense(world,context).ok,true);assert.equal(hasLicense(world,"frontier"),true);
  assert.equal(installStationModule(world,military,context,ship,"wpn_torpedo").ok,true);
  assert.equal(buyProbeAtStation(world,science,ship).ok,true);
  assert.equal(ship.prop.cargo.count("probe"),1);
  assert.equal(surveyAtStation(world,science,context,context.body).ok,true);
  assert.equal(surveyAtStation(world,science,context,context.body).reason,"surveyed");
});
