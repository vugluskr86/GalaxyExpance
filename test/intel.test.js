import test from "node:test";
import assert from "node:assert/strict";
import { makeItem } from "../src/game/items.js";
import { Propulsion } from "../src/game/propulsion.js";
import { WorldSave } from "../src/game/savegame.js";
import { buyDirectorySubscription, directoryEntries, ensureSystemMap, executeSpectrumScan, hasDirectorySubscription, knownTier, scanReadiness, scanSettings, signalSignature, sellResearchData } from "../src/game/intel.js";
import { deliverProbeReports, launchProbe } from "../src/game/probes.js";

function fixture(){
  const prop=new Propulsion(),world=new WorldSave({clusterSeed:737,player:{credits:100000}});
  const target={kind:"planet",i:0,j:0};
  const planet={_x:60,_y:0,moonList:[],surface:{minerals:.8,vegetation:.5},settlement:{id:"alpha",specialization:"science"}};
  const scene={world,S:{id:"system-alpha",seed:918,planets:[planet],comets:[],belt:null,name:"Alpha"},g:{def:{seed:7}},star:{x:2,y:3},
    playerShip:{prop,globPos:()=>[0,0]},npcs:[],probes:[],cargoField:[],posOf:()=>[60,0],obj:()=>planet,label:()=>"Alpha I"};
  return {world,prop,scene,target,planet};
}

test("first system entry writes the basic map without creating a fake scanner app",()=>{
  const {world,prop,scene}=fixture();
  const entry=ensureSystemMap(world,scene),computer=prop.computers[0];
  assert.equal(entry.baseMap.length,1);
  assert.equal(computer.memory.get("scanner.app"),null);
  assert.ok(computer.memory.get(entry.mapFile));
});

test("spectrum controls gate survey data and persist a tiered discovery",()=>{
  const {world,scene,target}=fixture();ensureSystemMap(world,scene);
  const signature=signalSignature(scene,target),settings=scanSettings(world,scene);
  settings.frequency=signature.frequency;settings.bearing=signature.bearing;settings.beam=45;settings.polarization=signature.polarization;
  const result=executeSpectrumScan(world,scene,target,settings);
  assert.equal(result.ok,true);assert.ok(result.record.tier>=1);
  assert.equal(knownTier(world,scene,target),result.record.tier);
});

test("planetary probes require the complete scanner, antenna, computer and probe chain",()=>{
  const {world,prop,scene,target}=fixture();ensureSystemMap(world,scene);
  assert.equal(scanReadiness(scene,target,{surface:true,requiresProbe:true}).reason,"no-planet-probe");
  prop.cargo.add(makeItem("probe"));
  const launched=launchProbe(scene,"planet",target);assert.equal(launched.ok,true);
  launched.mission.ready=true;
  assert.equal(deliverProbeReports(scene).length,1);
  assert.ok(knownTier(world,scene,target)>=1);
});

test("science data sells once and a paid directory exposes current-system entries",()=>{
  const {world,scene,target}=fixture();ensureSystemMap(world,scene);
  const signature=signalSignature(scene,target),settings=scanSettings(world,scene);
  Object.assign(settings,{frequency:signature.frequency,bearing:signature.bearing,beam:45,polarization:signature.polarization});
  assert.equal(executeSpectrumScan(world,scene,target,settings).ok,true);
  const station={id:"science-alpha",kind:"science"};
  const sale=sellResearchData(world,station);assert.equal(sale.ok,true);assert.equal(sale.count,1);
  assert.equal(sellResearchData(world,station).reason,"no-data");
  assert.equal(buyDirectorySubscription(world,station).ok,true);
  assert.equal(hasDirectorySubscription(world),true);
  assert.ok(directoryEntries(world,scene).some(entry=>entry.kind==="planet"));
});
