import { hash2i } from "../core/rng.js";
import { changeCredits, ensureEconomy } from "./economy.js";
import { communicationStatus, scannerStatus } from "./equipment.js";
import { scannerNetworkReadiness } from "./network.js";

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const positive=value=>value>>>0;
const refKey=ref=>ref?ref.kind==="ship"?`ship:${ref.id||ref.name||"unknown"}`:`${ref.kind}:${ref.i??0}:${ref.j??0}`:"unknown";
const sameRef=(a,b)=>refKey(a)===refKey(b);
const systemKey=scene=>scene?.S?.id||`${scene?.g?.def?.seed??0}:${scene?.star?.x??0}:${scene?.star?.y??0}`;
const angleDelta=(a,b)=>Math.abs(((a-b+540)%360)-180);

/** Persisted research records deliberately live outside generated systems.
 * Generator data stays seed-derived; only what the player learned, bought or
 * sold is mutable world state. */
export function ensureIntel(world){
  if(!world?.data)throw new TypeError("A WorldSave is required for research data");
  const intel=world.data.intel??(world.data.intel={version:1,systems:{},subscriptions:{},maps:{}});
  intel.version=1;intel.systems=intel.systems&&typeof intel.systems==="object"?intel.systems:{};
  intel.subscriptions=intel.subscriptions&&typeof intel.subscriptions==="object"?intel.subscriptions:{};
  intel.maps=intel.maps&&typeof intel.maps==="object"?intel.maps:{};
  return intel;
}

export const scanComputer=prop=>prop?.computers?.find(computer=>computer.memory)||null;
/** Scanner is a compiled PCOS application delivered by the OS image, not a
 * mutable pseudo-program copied into ComputerMemory on system entry. */
export const scannerProgramName="/usr/bin/scanner.bin";

function baseMap(scene){
  const bodies=[];
  scene.S?.planets?.forEach((planet,i)=>{
    bodies.push({ref:{kind:"planet",i,j:0},kind:"planet",x:planet._x,y:planet._y});
    planet.moonList?.forEach((moon,j)=>bodies.push({ref:{kind:"moon",i,j},kind:"moon",x:moon._x,y:moon._y}));
  });
  return bodies;
}

/** First entry into a system writes only orbital positions to the selected
 * computer's drive. The scanner executable itself is part of the PCOS image
 * at /usr/bin/scanner.bin; it is never faked as an in-memory .app file. */
export function ensureSystemMap(world,scene){
  const intel=ensureIntel(world),id=systemKey(scene);
  const entry=intel.systems[id]??(intel.systems[id]={baseMap:baseMap(scene),records:{},scanner:{frequency:500,bearing:0,beam:70,polarization:"linear",rxRate:50,txRate:50,dataVolume:50,mode:"spectrum"}});
  entry.baseMap??=baseMap(scene);entry.records??={};
  entry.scanner={frequency:500,bearing:0,beam:70,polarization:"linear",rxRate:50,txRate:50,dataVolume:50,mode:"spectrum",...(entry.scanner||{})};
  const computer=scanComputer(scene?.playerShip?.prop);
  if(computer?.memory){
    const filename=`nav-${id.replace(/[^a-z0-9_-]/gi,"_")}.json`;
    computer.memory.save(filename,JSON.stringify({system:id,bodies:entry.baseMap}));
    entry.mapFile=filename;entry.computerId=computer.instanceId;
  }
  return entry;
}

export function scanSettings(world,scene){return ensureSystemMap(world,scene).scanner;}
export function knownRecord(world,scene,ref){return ensureSystemMap(world,scene).records[refKey(ref)]||null;}
export const knownTier=(world,scene,ref)=>knownRecord(world,scene,ref)?.tier||0;
export const hasSurveyData=(world,scene,ref)=>knownTier(world,scene,ref)>0;

export function signalSignature(scene,ref){
  const seed=positive(hash2i(scene?.S?.seed??0,ref?.i??0,hash2i(ref?.j??0,String(ref?.kind||"").length,73)));
  const kinds={star:0,planet:1,moon:2,ship:3,comet:4,rock:5};
  return {
    frequency:120+(seed%840),bearing:positive(hash2i(seed,kinds[ref?.kind]??9,31))%360,
    polarization:["linear","circular","elliptic"][seed%3],band:20+(seed%55),strength:.45+((seed>>>8)%50)/100
  };
}

export function scanReadiness(scene,ref,{surface=false,requiresProbe=false,computerId=null}={}){
  const prop=scene?.playerShip?.prop,computer=scanComputer(prop);
  if(!prop?.scanner)return {ok:false,reason:"no-scanner"};
  if(!computer)return {ok:false,reason:"no-computer"};
  /* The executable is installed by PCOS at /usr/bin/scanner.bin.  Survey
     state is deliberately independent from volatile ComputerMemory, so a
     navigation map is not mistaken for an installed program. */
  const target=ref?.kind==="ship"?scene?.npcs?.find(npc=>npc.name===(ref.id||ref.name))?.ship?.globPos?.(scene):scene?.posOf?.(ref),ship=scene?.playerShip?.globPos?.(scene);
  const distance=target&&ship?Math.hypot(target[0]-ship[0],target[1]-ship[1]):0;
  const scan=scannerStatus(prop,distance),comm=communicationStatus(prop,distance);
  if(!scan.ok)return {ok:false,reason:scan.reason,distance,scan,comm};
  if(!comm.ok)return {ok:false,reason:comm.reason,distance,scan,comm};
  if(requiresProbe&&surface&&!prop.cargo?.count?.("probe"))return {ok:false,reason:"no-planet-probe",distance,scan,comm};
  if(requiresProbe&&!surface&&!prop.cargo?.count?.("probe_space"))return {ok:false,reason:"no-space-probe",distance,scan,comm};
  /* A scanner GUI never talks to fitted devices directly.  Once a PC is
     specified, both radio peripherals must answer through its NIC/switch path. */
  const network=computerId?scannerNetworkReadiness(prop,computerId,{scene,ship:scene?.playerShip}):null;
  if(network&&!network.ok)return {ok:false,reason:network.reason,distance,scan,comm,network};
  return {ok:true,distance,scan,comm,computer,network};
}

/** Resolve a tunable spectrum scan. The actual geometry is deterministic, but
 * the player must match frequency, antenna bearing, beam and polarization. */
export function executeSpectrumScan(world,scene,ref,settings=scanSettings(world,scene),options={}){
  const ready=scanReadiness(scene,ref,options);if(!ready.ok)return {ok:false,...ready};
  const signature=signalSignature(scene,ref);
  const freq=1-Math.min(1,Math.abs((settings.frequency||0)-signature.frequency)/Math.max(25,signature.band*3));
  const bearing=1-Math.min(1,angleDelta(settings.bearing||0,signature.bearing)/Math.max(12,settings.beam||1));
  const polar=settings.polarization===signature.polarization?1:.38;
  const throughput=.6+clamp(((settings.rxRate||0)+(settings.txRate||0))/200)*.4;
  const packet=.7+clamp((settings.dataVolume||0)/100)*.3;
  const quality=clamp((freq*.52+bearing*.32+polar*.16)*ready.scan.signal*ready.comm.signal*signature.strength*throughput*packet);
  if(quality<.28)return {ok:false,reason:"weak-signal",quality,signature,ready};
  const tier=Math.min(3,quality>.79?3:quality>.55?2:1);
  const target=ref.kind==="ship"?scene.npcs?.find(npc=>npc.name===(ref.id||ref.name))?.ship:scene.obj?.(ref),record={
    ref:{...ref},kind:ref.kind,tier,quality:Number(quality.toFixed(3)),frequency:signature.frequency,
    discoveredDay:ensureEconomy(world).day,sold:false,value:Math.round((160+tier*220)*quality*packet),source:"spectrum",dataVolume:settings.dataVolume||0,mode:settings.mode||"spectrum",
    mineralHint:target?.deposit?.resourceId||target?.surface?.minerals>.45?"mineral":null,
    lifeHint:target?.surface?.vegetation>.35?"possible":null,
    surfaceHint:target?.surface?"profile":"unknown"
  };
  const entry=ensureSystemMap(world,scene);entry.records[refKey(ref)]={...(entry.records[refKey(ref)]||{}),...record};
  return {ok:true,record,quality,signature,ready};
}

export function recordProbeData(world,scene,mission,report={}){
  const entry=ensureSystemMap(world,scene),key=refKey(mission.target),previous=entry.records[key]||{};
  const tier=Math.min(3,Math.max(previous.tier||0,mission.quality||1));
  const record={...previous,ref:{...mission.target},kind:mission.target.kind,tier,quality:Math.max(previous.quality||0,(mission.quality||1)/3),
    discoveredDay:ensureEconomy(world).day,sold:false,value:Math.max(previous.value||0,260+tier*260),source:`${mission.kind}-probe`,
    mineralHint:report.resource||previous.mineralHint||null,lifeHint:mission.kind==="planet"?"surveyed":previous.lifeHint||null,
    surfaceHint:mission.kind==="planet"?"surveyed":previous.surfaceHint||null,report:{...report}};
  entry.records[key]=record;return record;
}

export function unsoldResearch(world){
  const intel=ensureIntel(world);return Object.values(intel.systems).flatMap(system=>Object.values(system.records||{})).filter(record=>record?.tier>0&&!record.sold);
}

export function sellResearchData(world,station,context={}){
  if(!["science","government"].includes(station?.kind))return {ok:false,reason:"unavailable"};
  const records=unsoldResearch(world);if(!records.length)return {ok:false,reason:"no-data"};
  const multiplier=station.kind==="science"?1.15:1;
  const price=Math.max(1,Math.round(records.reduce((sum,record)=>sum+(record.value||0),0)*multiplier));
  if(!changeCredits(world,price,{kind:"research-data-sale",locationId:station.id,goodId:"data",quantity:records.length,note:"survey archive"}))return {ok:false,reason:"credits"};
  for(const record of records){record.sold=true;record.soldAt=station.id;record.soldDay=ensureEconomy(world).day;}
  return {ok:true,price,count:records.length};
}

export const hasDirectorySubscription=(world,kind="directory")=>!!ensureIntel(world).subscriptions[kind];
export function buyDirectorySubscription(world,station,kind="directory"){
  if(!["science","government"].includes(station?.kind))return {ok:false,reason:"unavailable"};
  const intel=ensureIntel(world);if(intel.subscriptions[kind])return {ok:false,reason:"owned"};
  const price=kind==="directory"?18000:9000;
  if(!changeCredits(world,-price,{kind:"research-subscription",locationId:station.id,note:kind}))return {ok:false,reason:"credits"};
  intel.subscriptions[kind]={stationId:station.id,day:ensureEconomy(world).day};return {ok:true,price,kind};
}

export function buyLocalSurveyMap(world,station,scene){
  if(!["science","government"].includes(station?.kind))return {ok:false,reason:"unavailable"};
  const intel=ensureIntel(world),id=systemKey(scene);if(intel.maps[id])return {ok:false,reason:"owned"};
  const price=12000;
  if(!changeCredits(world,-price,{kind:"survey-map",locationId:station.id,note:id}))return {ok:false,reason:"credits"};
  intel.maps[id]={stationId:station.id,day:ensureEconomy(world).day,poi:true};
  const entry=ensureSystemMap(world,scene);
  for(const body of entry.baseMap){
    const record=entry.records[refKey(body.ref)];
    if(record)record.mapVerified=true;
  }
  return {ok:true,price};
}

export function directoryEntries(world,scene){
  if(!hasDirectorySubscription(world))return [];
  const entry=ensureSystemMap(world,scene),entries=[{kind:"star",name:scene.S.name,ref:{kind:"star",i:0,j:0},detail:"star"}];
  for(const body of entry.baseMap){
    const object=scene.obj?.(body.ref),record=entry.records[refKey(body.ref)];
    entries.push({kind:body.kind,name:scene.label?.(body.ref)||refKey(body.ref),ref:{...body.ref},detail:record?`tier-${record.tier}`:"position"});
    if(object?.settlement)entries.push({kind:"station",name:object.settlement.id,ref:{...body.ref},detail:"station"});
  }
  for(const npc of scene.npcs||[]){
    const record=entry.records[`ship:${npc.name}`];
    if(record)entries.push({kind:"ship",name:npc.name,ref:null,detail:`tier-${record.tier}`});
  }
  return entries;
}

export { refKey, sameRef, systemKey };
