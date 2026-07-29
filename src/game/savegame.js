import { makeItem } from "./items.js";
import { Inventory, FloatingItem } from "./inventory.js";
import { stepSystem } from "../gen/system.js";
import { player } from "./player.js";

export const SAVE_KEY="pixel-cosmos.world.v1";
const version=1;

const bytesTo64=bytes=>{
  let text="";for(let i=0;i<bytes.length;i+=0x4000)text+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
  return btoa(text);
};
const bytesFrom64=text=>Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));

export function snapshotItem(item){
  if(!item)return null;
  const out={id:item.id,qty:item.qty,slots:{}};
  for(const [slot,child] of Object.entries(item.slots||{}))out.slots[slot]=snapshotItem(child);
  for(const key of ["ammoLeft","cooldownLeft","charge"])if(item[key]!==undefined)out[key]=item[key];
  if(item.firmware)out.firmware={biosSource:item.firmware.biosSource,settings:{...item.firmware.settings}};
  if(item.storage)out.storage={ramKb:item.storage.ramKb,pcfsImage:item.storage.pcfsImage?bytesTo64(item.storage.pcfsImage):null,programs:item.storage.programs.map(program=>({
    name:program.name,size:program.size,code:program.code,data:program.data?bytesTo64(program.data):null
  }))};
  return out;
}
export function restoreItem(data){
  if(!data?.id)return null;
  const item=makeItem(data.id,data.qty||1);
  for(const [slot,child] of Object.entries(data.slots||{}))item.slots[slot]=restoreItem(child);
  for(const key of ["ammoLeft","cooldownLeft","charge"])if(data[key]!==undefined)item[key]=data[key];
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
    prop:{fuel:p.fuel,throttle:p.throttle,activeWeaponSlot:p.activeWeaponSlot,slots:Object.fromEntries(Object.entries(p.slots).map(([key,item])=>[key,snapshotItem(item)])),inventory:snapInventory(p.inventory),cargo:snapInventory(p.cargo)}};
}
export function restoreShip(ship,data){
  if(!data)return ship;
  for(const key of ["col","mode","rx","ry","rvx","rvy","nose","altitude","cruiseV","sas","integrity","empTimer"])if(data[key]!==undefined)ship[key]=data[key];
  ship.primary=data.primary?{...data.primary}:ship.primary;ship.target=data.target?{...data.target}:null;ship.landedOn=data.landedOn?{...data.landedOn}:null;
  const p=data.prop;if(!p)return ship;
  for(const [slot,item] of Object.entries(p.slots||{}))ship.prop.slots[slot]=restoreItem(item);
  ship.prop.fuel=p.fuel;ship.prop.throttle=p.throttle||0;ship.prop.activeWeaponSlot=p.activeWeaponSlot||"weapon1";
  ship.prop.inventory=restoreInventory(p.inventory);ship.prop.cargo=restoreInventory(p.cargo);
  return ship;
}
const snapshotCargo=field=>field.map(f=>({item:snapshotItem(f.item),primary:f.primary,rx:f.rx,ry:f.ry,rvx:f.rvx,rvy:f.rvy,spin:f.spin,landed:f.landed}));
const restoreCargo=data=>(data||[]).map(f=>{const out=new FloatingItem(restoreItem(f.item),f.primary,f.rx,f.ry,f.rvx,f.rvy);out.spin=f.spin||0;out.landed=f.landed||null;return out;});
const snapshotOrbit=S=>({sunRot:S.sun?.rot,planets:S.planets.map(p=>({ang:p.ang,rot:p.rot,crot:p.crot,moons:p.moonList.map(m=>({ang:m.ang,rot:m.rot,crot:m.crot}))})),comets:S.comets.map(c=>c.th),rocks:S.belt?.rocks.map(r=>r.ang)||[]});
function restoreOrbit(S,data){
  if(!data||S.bhOnly)return;
  if(data.sunRot!==undefined)S.sun.rot=data.sunRot;
  for(let i=0;i<S.planets.length;i++){const saved=data.planets?.[i],planet=S.planets[i];if(!saved)continue;Object.assign(planet,{ang:saved.ang,rot:saved.rot,crot:saved.crot});for(let j=0;j<planet.moonList.length;j++)Object.assign(planet.moonList[j],saved.moons?.[j]||{});}
  S.comets.forEach((comet,i)=>{if(data.comets?.[i]!==undefined)comet.th=data.comets[i];});S.belt?.rocks.forEach((rock,i)=>{if(data.rocks?.[i]!==undefined)rock.ang=data.rocks[i];});stepSystem(S,0);
}

export class WorldSave {
  constructor(data={}){this.data={version,clusterSeed:data.clusterSeed??null,galaxyIndex:data.galaxyIndex??0,location:data.location??null,player:data.player??{},systems:data.systems??{}};}
  key(galaxy,star){return `${galaxy.def.seed}:${galaxy.systemSeedOf(star)}`;}
  capture(scene,galaxyIndex=this.data.galaxyIndex){
    const key=this.key(scene.g,scene.star);
    this.data.galaxyIndex=galaxyIndex;this.data.player={fuel:player.fuel,lastGal:player.lastGal,lastPos:player.lastPos};this.data.location={key,star:{x:scene.star.x,y:scene.star.y,kind:scene.star.kind,ci:scene.star.ci,name:scene.star.name}};
    this.data.systems[key]={orbit:snapshotOrbit(scene.S),player:snapshotShip(scene.playerShip),cargo:snapshotCargo(scene.cargoField),npcs:scene.npcs.map(npc=>({name:npc.name,ship:snapshotShip(npc.ship),agent:{goal:npc.agent.state.goal,credits:npc.agent.state.credits,blackboard:{...npc.agent.state.blackboard}}})),selected:scene.sel,orbitAlt:scene.orbitAlt};
    return this.data.systems[key];
  }
  restore(scene){
    const state=this.data.systems[this.key(scene.g,scene.star)];if(!state)return false;
    restoreOrbit(scene.S,state.orbit);restoreShip(scene.playerShip,state.player);scene.cargoField=restoreCargo(state.cargo);scene.sel=state.selected||scene.sel;scene.orbitAlt=state.orbitAlt||scene.orbitAlt;
    const byName=new Map(scene.npcs.map(npc=>[npc.name,npc]));
    scene.npcs=(state.npcs||[]).map(saved=>{const npc=byName.get(saved.name);if(!npc)return null;restoreShip(npc.ship,saved.ship);Object.assign(npc.agent.state,{goal:saved.agent?.goal||"idle",credits:saved.agent?.credits??npc.agent.state.credits,blackboard:{...(saved.agent?.blackboard||{})}});return npc;}).filter(Boolean);
    return true;
  }
  persist(storage=globalThis.localStorage){if(!storage)return false;try{storage.setItem(SAVE_KEY,JSON.stringify(this.data));return true;}catch{return false;}}
  restorePlayer(){Object.assign(player,{fuel:this.data.player.fuel??player.fuel,lastGal:this.data.player.lastGal??null,lastPos:this.data.player.lastPos??null});}
}
export function loadWorld(storage=globalThis.localStorage){
  try{const raw=storage?.getItem(SAVE_KEY);if(!raw)return null;const data=JSON.parse(raw);return data?.version===version?new WorldSave(data):null;}catch{return null;}
}
