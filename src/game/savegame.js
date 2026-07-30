import { makeItem, ensureItemInstanceId } from "./items.js";
import { makeBuiltinShipyardHull } from "./shipyard.js";
import { Inventory, FloatingItem } from "./inventory.js";
import { stepSystem } from "../gen/system.js";
import { player } from "./player.js";
import { systemId } from "../core/ids.js";

export const SAVE_KEY="pixel-cosmos.world.v1";
const version=3;

const bytesTo64=bytes=>{
  let text="";for(let i=0;i<bytes.length;i+=0x4000)text+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
  return btoa(text);
};
const bytesFrom64=text=>Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));

export function snapshotItem(item){
  if(!item)return null;
  const out={id:item.id,qty:item.qty,instanceId:ensureItemInstanceId(item),slots:{}};
  for(const [slot,child] of Object.entries(item.slots||{}))out.slots[slot]=snapshotItem(child);
  for(const key of ["ammoLeft","cooldownLeft","heat","charge","connectedComputerId","unique","uniqueNote"])if(item[key]!==undefined)out[key]=item[key];
  // Imported hulls carry their JSON geometry and optional PNG data URL.
  if(item.shipyard)out.shipyard=JSON.parse(JSON.stringify(item.shipyard));
  if(item.firmware)out.firmware={biosSource:item.firmware.biosSource,settings:{...item.firmware.settings}};
  if(item.storage)out.storage={ramKb:item.storage.ramKb,pcfsImage:item.storage.pcfsImage?bytesTo64(item.storage.pcfsImage):null,programs:item.storage.programs.map(program=>({
    name:program.name,size:program.size,code:program.code,data:program.data?bytesTo64(program.data):null
  }))};
  return out;
}
export function restoreItem(data){
  if(!data?.id)return null;
  const item=makeItem(data.id,data.qty||1);
  if(data.instanceId)item.instanceId=data.instanceId;
  for(const [slot,child] of Object.entries(data.slots||{}))item.slots[slot]=restoreItem(child);
  for(const key of ["ammoLeft","cooldownLeft","heat","charge","connectedComputerId","unique","uniqueNote"])if(data[key]!==undefined)item[key]=data[key];
  if(data.shipyard)item.shipyard=JSON.parse(JSON.stringify(data.shipyard));
  else if(item.slot==="hull")item.shipyard=makeBuiltinShipyardHull(item.id,item.stats);
  if(data.firmware&&item.firmware){item.firmware.biosSource=data.firmware.biosSource;item.firmware.saveSettings(data.firmware.settings);}
  if(data.storage&&item.storage){
    item.storage.ramKb=data.storage.ramKb||item.storage.ramKb;
    if(data.storage.pcfsImage)item.storage.pcfsImage=bytesFrom64(data.storage.pcfsImage);
    item.storage.programs=(data.storage.programs||[]).map(program=>program.data
      ? {name:program.name,size:program.size,data:bytesFrom64(program.data)}
      : {name:program.name,size:program.size,code:program.code||""});
  }
  return item;
}

const snapInventory=inventory=>(inventory?.items||[]).map(snapshotItem);
const restoreInventory=data=>new Inventory((data||[]).map(restoreItem).filter(Boolean));
export function snapshotShip(ship){
  if(!ship)return null;
  const p=ship.prop;
  return {col:ship.col,mode:ship.mode,primary:ship.primary,target:ship.target,rx:ship.rx,ry:ship.ry,rvx:ship.rvx,rvy:ship.rvy,nose:ship.nose,
    altitude:ship.altitude,cruiseV:ship.cruiseV,landedOn:ship.landedOn,sas:ship.sas,integrity:ship.integrity,empTimer:ship.empTimer,
    prop:{fuel:p.fuel,energy:p.energy,throttle:p.throttle,activeWeaponSlot:p.activeWeaponSlot,network:JSON.parse(JSON.stringify(p.network||{links:[],addresses:{},macTables:{},tcp:[],frames:[]})),slots:Object.fromEntries(Object.entries(p.slots).map(([key,item])=>[key,snapshotItem(item)])),inventory:snapInventory(p.inventory),cargo:snapInventory(p.cargo)}};
}
export function restoreShip(ship,data){
  if(!data)return ship;
  for(const key of ["col","mode","rx","ry","rvx","rvy","nose","altitude","cruiseV","sas","integrity","empTimer"])if(data[key]!==undefined)ship[key]=data[key];
  ship.primary=data.primary?{...data.primary}:ship.primary;ship.target=data.target?{...data.target}:null;ship.landedOn=data.landedOn?{...data.landedOn}:null;
  const p=data.prop;if(!p)return ship;
  for(const [slot,item] of Object.entries(p.slots||{})){
    /* v2 saves used a singular computer slot. Keep it as computer1 so old
       worlds open with their firmware and BIOS settings intact. */
    ship.prop.slots[slot==="computer"?"computer1":slot]=restoreItem(item);
  }
  ship.prop.fuel=p.fuel;ship.prop.energy=Math.max(0,p.energy||0);ship.prop.throttle=p.throttle||0;ship.prop.activeWeaponSlot=p.activeWeaponSlot||"weapon1";
  ship.prop.network=JSON.parse(JSON.stringify(p.network||{links:[],addresses:{},macTables:{},tcp:[],frames:[]}));
  ship.prop.inventory=restoreInventory(p.inventory);ship.prop.cargo=restoreInventory(p.cargo);
  ship.prop._bindNetworkComputers?.();
  /* Older saves had no terminal cable.  Preserve the player's existing
     terminal as a sensible default when its old computer instance was
     restored under computer1. */
  const fallbackComputer=ship.prop.computers[0];
  for(const terminal of ship.prop.terminals){
    if(fallbackComputer&&!ship.prop.connectedComputer(terminal))terminal.connectedComputerId=fallbackComputer.instanceId;
  }
  return ship;
}
/** Snapshot loose cargo independently from the ship: positions and discovery
 * state belong to the world, while the Item payload uses the shared item
 * serializer. This is deliberately exported for regression tests. */
export const snapshotFloatingItems=field=>(field||[]).map(f=>({
  item:snapshotItem(f.item),primary:f.primary?{...f.primary}:null,rx:f.rx,ry:f.ry,
  rvx:f.rvx,rvy:f.rvy,spin:f.spin,landed:f.landed?{...f.landed}:null,
  /* Old saves did not have this flag: cargo in space stays visible by default. */
  discovered:f.discovered !== false
}));
export const restoreFloatingItems=data=>(data||[]).map(f=>{
  const item=restoreItem(f.item);if(!item)return null;
  const out=new FloatingItem(item,f.primary||{kind:"star",i:0,j:0},f.rx,f.ry,f.rvx,f.rvy);
  out.spin=Number.isFinite(f.spin)?f.spin:out.spin;
  out.landed=f.landed?{...f.landed}:null;
  out.discovered=f.discovered === undefined ? !out.landed : !!f.discovered;
  return out;
}).filter(Boolean);

/** A single source of truth for startup and navigation restoration. */
export const landedBodyRef=ship=>ship?.mode==="landed"&&ship.landedOn?{...ship.landedOn}:null;
const snapshotOrbit=S=>({sunRot:S.sun?.rot,planets:S.planets.map(p=>({ang:p.ang,rot:p.rot,crot:p.crot,moons:p.moonList.map(m=>({ang:m.ang,rot:m.rot,crot:m.crot}))})),comets:S.comets.map(c=>c.th),rocks:S.belt?.rocks.map(r=>({ang:r.ang,deposit:r.deposit?{...r.deposit}:null}))||[]});
function restoreOrbit(S,data){
  if(!data||S.bhOnly)return;
  if(data.sunRot!==undefined)S.sun.rot=data.sunRot;
  for(let i=0;i<S.planets.length;i++){const saved=data.planets?.[i],planet=S.planets[i];if(!saved)continue;Object.assign(planet,{ang:saved.ang,rot:saved.rot,crot:saved.crot});for(let j=0;j<planet.moonList.length;j++)Object.assign(planet.moonList[j],saved.moons?.[j]||{});}
  S.comets.forEach((comet,i)=>{if(data.comets?.[i]!==undefined)comet.th=data.comets[i];});S.belt?.rocks.forEach((rock,i)=>{const saved=data.rocks?.[i];if(saved===undefined)return;if(typeof saved==="number")rock.ang=saved;else{rock.ang=saved.ang; if(saved.deposit)rock.deposit={...rock.deposit,...saved.deposit};}});stepSystem(S,0);
}

export class WorldSave {
  constructor(data={}){this.data={version,clusterSeed:data.clusterSeed??null,galaxyIndex:data.galaxyIndex??0,location:data.location??null,player:data.player??{},systems:data.systems??{},economy:data.economy??null,intel:data.intel??null};}
  key(galaxy,star){return systemId(galaxy.def.seed,galaxy.systemSeedOf(star));}
  legacyKey(galaxy,star){return `${galaxy.def.seed}:${galaxy.systemSeedOf(star)}`;}
  /** Keep only the most recently visited systems. Without a cap the JSON
   * payload grows without bound as the player explores, turning autosave
   * + localStorage.setItem into an O(n) pause that grows every visit. */
  _pruneSystems(currentKey){
    const entries=Object.entries(this.data.systems);
    if(entries.length<=5)return;
    entries.sort(([,a],[,b])=>(b._ts||0)-(a._ts||0));
    const pruned={};
    for(let i=0;i<Math.min(5,entries.length);i++){
      pruned[entries[i][0]]=entries[i][1];
    }
    /* Always keep the current system even if it's not in the top 5 by timestamp. */
    if(!pruned[currentKey]&&this.data.systems[currentKey]){
      pruned[currentKey]=this.data.systems[currentKey];
    }
    this.data.systems=pruned;
  }
  capture(scene,galaxyIndex=this.data.galaxyIndex){
    const key=this.key(scene.g,scene.star);
    this.data.galaxyIndex=galaxyIndex;this.data.player={fuel:player.fuel,credits:player.credits,lastGal:player.lastGal,lastPos:player.lastPos};this.data.location={key,star:{x:scene.star.x,y:scene.star.y,kind:scene.star.kind,ci:scene.star.ci,name:scene.star.name}};
    const entry={_ts:Date.now(),orbit:snapshotOrbit(scene.S),player:snapshotShip(scene.playerShip),cargo:snapshotFloatingItems(scene.cargoField),probes:(scene.probes||[]).map(probe=>({...probe,target:{...probe.target}})),npcs:scene.npcs.map(npc=>({name:npc.name,ship:snapshotShip(npc.ship),economy:npc.economy?JSON.parse(JSON.stringify(npc.economy)):null,agent:{goal:npc.agent.state.goal,credits:npc.agent.state.credits,blackboard:{...(npc.agent.state.blackboard||{})}}})),selected:scene.sel?{...scene.sel}:null,orbitAlt:scene.orbitAlt};
    this.data.systems[key]=entry;
    this._pruneSystems(key);
    return entry;
  }
  restore(scene){
    const key=this.key(scene.g,scene.star);const state=this.data.systems[key]??this.data.systems[this.legacyKey(scene.g,scene.star)];if(!state)return false;
    this.data.systems[key]=state;
    restoreOrbit(scene.S,state.orbit);restoreShip(scene.playerShip,state.player);scene.cargoField=restoreFloatingItems(state.cargo);scene.probes=(state.probes||[]).map(probe=>({...probe,target:{...probe.target}}));
    /* A selected body from an earlier visit must not override the body the
       player is physically standing on. It caused the restored system screen
       to offer a new landing approach instead of the take-off action. */
    scene.sel=landedBodyRef(scene.playerShip)||state.selected||scene.sel;scene.orbitAlt=state.orbitAlt||scene.orbitAlt;
    const byName=new Map(scene.npcs.map(npc=>[npc.name,npc]));
    scene.npcs=(state.npcs||[]).map(saved=>{const npc=byName.get(saved.name);if(!npc)return null;restoreShip(npc.ship,saved.ship);npc.economy=saved.economy?JSON.parse(JSON.stringify(saved.economy)):null;Object.assign(npc.agent.state,{goal:saved.agent?.goal||"idle",credits:saved.agent?.credits??npc.agent.state.credits,blackboard:{...(saved.agent?.blackboard||{})}});return npc;}).filter(Boolean);
    return true;
  }
  persist(storage=globalThis.localStorage){if(!storage)return false;try{storage.setItem(SAVE_KEY,JSON.stringify(this.data));return true;}catch{return false;}}
  restorePlayer(){Object.assign(player,{fuel:this.data.player.fuel??player.fuel,credits:this.data.player.credits??this.data.economy?.credits??player.credits,lastGal:this.data.player.lastGal??null,lastPos:this.data.player.lastPos??null});}
}
export function loadWorld(storage=globalThis.localStorage){
  try{const raw=storage?.getItem(SAVE_KEY);if(!raw)return null;const data=JSON.parse(raw);return data?.version>=1&&data.version<=version?new WorldSave(data):null;}catch{return null;}
}
