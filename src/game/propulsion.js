/** Конфигурация корабля: слоты, топливо, трюм.
 *
 *  Раньше двигатель и бак были жёстко зашитыми списками; теперь это
 *  предметы из каталога (items.js), установленные в слоты. Внешний API
 *  сохранён — Ship и сцены продолжают читать prop.engine.thrust и т.д. */

import { G0, DU_M } from "./units.js";
import { makeItem, byId, bySlot, SLOTS, itemSlotFor } from "./items.js";
import { Inventory, starterInventory } from "./inventory.js";
import { makeBuiltinShipyardHull } from "./shipyard.js";

/* Совместимость: прежние экспорты собираются из каталога. */
export const ENGINES = bySlot("engine").map(d => ({
  id:d.id, name:d.name, thrust:d.stats.thrust, isp:d.stats.isp, mass:d.mass }));
export const TANKS = bySlot("tank").map(d => ({
  id:d.id, name:d.name, dry:d.mass, fuel:d.stats.cap }));
export const HULL_MASS = 5.0;

export class Propulsion {
  constructor(engineId = "eng_main", tankId = "tank_m",
              hullId = "hull_dreadnought", scoopId = "scoop_fuel"){
    this.slots = {
      hull:   makeItem(hullId),
      engine: makeItem(engineId),
      tank:   makeItem(tankId),
      scoop:  scoopId ? makeItem(scoopId) : null,
      shield: null,
      droid: null,
      reactor: makeItem("reactor_mk2"),
      weapon1: null, weapon2: null, weapon3: null, weapon4: null, weapon5: null,
      computer1: makeItem("comp_expand"), computer2:null, computer3:null, computer4:null, computer5:null,
      terminal1: makeItem("term_basic"), terminal2:null, terminal3:null, terminal4:null, terminal5:null,
      antenna: makeItem("antenna_mid"), scanner: makeItem("scanner_tactical"),
      hyperdrive:null, capacitor:null, mining:null, gyro:null,
    };
    this.slots.terminal1.connectedComputerId=this.slots.computer1.instanceId;
    this.slots.hull.shipyard=makeBuiltinShipyardHull(this.slots.hull.id,this.slots.hull.stats);
    this.fuel = this.slots.tank.stats.cap;
    this.throttle = 0;
    this.activeWeaponSlot = "weapon1";
    this.inventory = starterInventory();
    this.cargo = new Inventory([]);       // то, что лежит в трюме корабля
    this.scooping = false;
    this.energy = 0;
    /* Кабели и DHCP-аренды привязаны к instanceId узлов, а не к позиции в инвентаре. */
    this.network={links:[],addresses:{},macTables:{},tcp:[],frames:[]};
    this._bindNetworkComputers();
  }

  /* ---------- совместимый доступ к модулям ---------- */
  get engine(){
    const it = this.slots.engine;
    return it ? { id:it.id, name:it.name, thrust:it.stats.thrust,
                  isp:it.stats.isp, mass:it.def.mass, tag:it.tag }
              : { id:"none", name:"нет", thrust:0, isp:1, mass:0, tag:"—" };
  }
  get tank(){
    const it = this.slots.tank;
    return it ? { id:it.id, name:it.name, dry:it.def.mass, fuel:it.stats.cap, tag:it.tag }
              : { id:"none", name:"нет", dry:0, fuel:0, tag:"—" };
  }
  get hull(){
    const it = this.slots.hull;
    return it ? { id:it.id, name:it.name, mass:it.def.mass,
                  cargo:it.stats.cargo, tag:it.tag }
              : { id:"none", name:"нет", mass:2, cargo:0, tag:"—" };
  }
  get scoop(){
    const it = this.slots.scoop;
    return it ? { id:it.id, name:it.name, mass:it.def.mass, tag:it.tag, ...it.stats } : null;
  }

  get hullStats(){ return this.slots.hull?.stats || {}; }
  get slotDefs(){
    const stats=this.hullStats,weapons=Math.max(1,Math.min(5,stats.weaponSlots||1));
    const computers=Math.max(0,Math.min(5,stats.computerSlots??1));
    const terminals=Math.max(0,Math.min(5,stats.terminalSlots??1));
    return SLOTS.filter(slot=>{
      if(slot.id==="scoop")return stats.scoopSlot!==false;
      if(slot.id==="shield")return stats.shieldSlot!==false;
      if(slot.id==="droid")return stats.droidSlot!==false;
      if(slot.id.startsWith("weapon"))return Number(slot.id.slice(6))<=weapons;
      if(slot.id.startsWith("computer"))return Number(slot.id.slice(8))<=computers;
      if(slot.id.startsWith("terminal"))return Number(slot.id.slice(8))<=terminals;
      if(slot.id==="antenna")return stats.antennaSlot!==false;
      if(slot.id==="scanner")return stats.scannerSlot!==false;
      if(slot.id==="hyperdrive")return stats.hyperdriveSlot!==false;
      if(slot.id==="capacitor")return stats.capacitorSlot!==false;
      if(slot.id==="mining")return stats.miningSlot!==false;
      if(slot.id==="gyro")return stats.gyroSlot!==false;
      return true;
    });
  }
  slotAvailable(slot){ return this.slotDefs.some(def=>def.id===slot); }
  itemType(slot){ return itemSlotFor(slot); }
  accepts(item){ return !!item&&this.slotDefs.some(slot=>this.itemType(slot.id)===item.slot); }
  get weapons(){ return this.slotDefs.filter(slot=>slot.id.startsWith("weapon")).map(slot=>this.slots[slot.id]).filter(Boolean); }
  get weapon(){ return this.weapons[0] || null; }
  get activeWeapon(){ return this.slots[this.activeWeaponSlot] || this.weapon; }
  get shield(){ return this.slots.shield || null; }
  get droid(){ return this.slots.droid || null; }
  get reactor(){ return this.slots.reactor || null; }
  get computers(){ return this.slotDefs.filter(slot=>slot.id.startsWith("computer")).map(slot=>this.slots[slot.id]).filter(Boolean); }
  get terminals(){ return this.slotDefs.filter(slot=>slot.id.startsWith("terminal")).map(slot=>this.slots[slot.id]).filter(Boolean); }
  get antenna(){ return this.slots.antenna || null; }
  get scanner(){ return this.slots.scanner || null; }
  get hyperdrive(){ return this.slots.hyperdrive || null; }
  get capacitor(){ return this.slots.capacitor || null; }
  get miner(){ return this.slots.mining || null; }
  get gyro(){ return this.slots.gyro || null; }
  get energyCap(){ return this.capacitor?.stats.capacity || 0; }
  _bindNetworkComputers(){for(const computer of Object.values(this.slots).filter(item=>item?.slot==="computer"))if(computer.runtime)computer.runtime.networkProp=this;}
  get energyFrac(){ return this.energyCap>0?this.energy/this.energyCap:0; }
  hasWorkingComputer(){ return !!this.reactor && this.computers.length>0; }
  connectedComputer(terminal){
    const id=terminal?.connectedComputerId;
    return this.computers.find(computer=>computer.instanceId===id)||null;
  }
  connectedTerminals(){ return this.terminals.filter(terminal=>this.connectedComputer(terminal)); }
  hasConnectedTerminal(computer=null){
    return this.terminals.some(terminal=>{
      const linked=this.connectedComputer(terminal);
      return !!linked&&(!computer||linked===computer);
    });
  }
  connectTerminal(terminalSlot,computerSlot){
    const terminal=this.slots[terminalSlot],computer=this.slots[computerSlot];
    if(!terminal||terminal.slot!=="terminal"||!computer||computer.slot!=="computer")return false;
    if(this.terminals.some(other=>other!==terminal&&other.connectedComputerId===computer.instanceId))return false;
    terminal.connectedComputerId=computer.instanceId;return true;
  }
  disconnectTerminal(terminalSlot){const terminal=this.slots[terminalSlot];if(!terminal)return false;delete terminal.connectedComputerId;return true;}
  tickWeapons(dt){
    for(const weapon of this.weapons){weapon.cooldownLeft=Math.max(0,(weapon.cooldownLeft||0)-Math.max(0,dt));weapon.heat=Math.max(0,(weapon.heat||0)-Math.max(0,dt)*.35);}
  }
  tickSystems(dt){
    const shield=this.shield,reactor=this.reactor;
    if(this.capacitor&&reactor){
      const rate=Math.min(this.capacitor.stats.chargeRate||0,(reactor.stats.power||0)*.1);
      this.energy=Math.min(this.energyCap,this.energy+rate*Math.max(0,dt));
    }
    if(!shield)return;
    shield.charge ??= shield.stats.capacity;
    const power=Math.max(0.25,(reactor?.stats.power||0)/80);
    shield.charge=Math.min(shield.stats.capacity,shield.charge+shield.stats.regen*power*Math.max(0,dt));
  }
  hyperjumpStatus(distance){
    const drive=this.hyperdrive,cap=this.capacitor;
    if(!drive)return {ok:false,reason:"no-hyperdrive"};
    if(!cap)return {ok:false,reason:"no-capacitor"};
    if(!this.reactor)return {ok:false,reason:"no-power"};
    if(this.overloadStatus().overloaded)return {ok:false,reason:"overload"};
    const factor=Math.max(.35,distance/Math.max(1,drive.stats.range||1));
    if(distance>(drive.stats.range||0))return {ok:false,reason:"range",range:drive.stats.range};
    const energy=Math.ceil((drive.stats.energy||0)*factor),antimatter=Number(((drive.stats.antimatter||0)*factor).toFixed(2));
    const carried=this.cargo.count("antimatter");
    if(this.energy<energy)return {ok:false,reason:"energy",energy,antimatter};
    if(carried+1e-6<antimatter)return {ok:false,reason:"antimatter",energy,antimatter};
    return {ok:true,energy,antimatter,range:drive.stats.range,prepare:drive.stats.prepare||0};
  }
  consumeHyperjump(distance){
    const status=this.hyperjumpStatus(distance);if(!status.ok)return status;
    const source=this.cargo.items.find(item=>item.id==="antimatter");
    this.cargo.remove(source,status.antimatter);this.energy-=status.energy;return status;
  }
  fireWeapon(slot=this.activeWeaponSlot){
    const weapon=this.slots[slot] || this.weapon,stats=weapon?.stats;
    if(!weapon||!stats||weapon.cooldownLeft>0)return null;
    if(stats.ammo>0){
      weapon.ammoLeft ??= stats.ammo;
      if(weapon.ammoLeft<=0)return null;
      weapon.ammoLeft--;
    }
    weapon.cooldownLeft=stats.cooldown||0;
    weapon.heat=Math.min(1,(weapon.heat||0)+Math.max(.08,(stats.damage||1)/300));
    return { ...stats, id:weapon.id, name:weapon.name };
  }

  setEngine(id){ this.install(makeItem(id)); }
  setTank(id){ this.install(makeItem(id)); }

  /* ---------- установка и снятие ---------- */
  /** Ставит предмет в его слот; вытесненный модуль уходит в инвентарь. */
  install(item,preferredSlot=null){
    if(!item)return null;
    let slot=preferredSlot;
    if(item.slot==="weapon"){
      const available=this.slotDefs.filter(def=>def.id.startsWith("weapon")).map(def=>def.id);
      if(!available.includes(slot))slot=available.find(id=>!this.slots[id])||available[0];
    }else{
      const available=this.slotDefs.filter(def=>this.itemType(def.id)===item.slot).map(def=>def.id);
      if(!available.includes(slot))slot=available.find(id=>!this.slots[id])||available[0];
    }
    if(!slot||!this.slots.hasOwnProperty(slot)||!this.slotAvailable(slot)||this.itemType(slot)!==item.slot)return null;
    const old=this.slots[slot];this.slots[slot]=item;
    if(slot==="hull"&&!item.shipyard)item.shipyard=makeBuiltinShipyardHull(item.id,item.stats);
    if (item.slot === "tank") this.fuel = Math.min(this.fuel, item.stats.cap);
    if(item.slot==="terminal")delete item.connectedComputerId;
    this._bindNetworkComputers();
    return old;
  }
  /** Снимает модуль из слота (корпус снять нельзя). */
  uninstall(slot){
    if (slot === "hull" || !this.slotAvailable(slot)) return null;
    const it = this.slots[slot];
    if (!it) return null;
    this.slots[slot] = null;
    this._bindNetworkComputers();
    return it;
  }

  /* ---------- массы ---------- */
  get moduleMass(){
    return Object.values(this.slots).reduce((s, it) => s + (it ? it.mass : 0), 0);
  }
  get cargoMass(){ return this.cargo.massTotal; }
  get cargoCap(){ return this.hull.cargo; }
  get inventoryMass(){ return this.inventory.massTotal; }
  get dryMass(){ return this.moduleMass + this.cargoMass + this.inventoryMass; }
  get mass(){ return this.dryMass + this.fuel; }
  get maxTakeoffMass(){
    const hull=Number(this.hullStats.maxTakeoffMass)||Infinity;
    const engine=Number(this.slots.engine?.stats.maxLiftMass)||Infinity;
    return Math.min(hull,engine);
  }
  overloadStatus(extraMass=0){
    const mass=this.mass+Math.max(0,extraMass),limit=this.maxTakeoffMass,excess=Math.max(0,mass-limit);
    return {mass,limit,excess,overloaded:excess>1e-6,reason:excess>1e-6?"overload":null};
  }
  canAddMass(mass){ return !this.overloadStatus(mass).overloaded; }
  get fuelCap(){ return this.tank.fuel; }
  get fuelFrac(){ return this.fuelCap > 0 ? this.fuel/this.fuelCap : 0; }

  refuel(){ this.fuel = this.fuelCap; }
  /** Сбор топлива у звезды, т. Возвращает фактически принятое. */
  scoopFuel(dt){
    const sc = this.scoop;
    if (!sc || !sc.scoopRate) return 0;
    const take = Math.min(sc.scoopRate*dt, this.fuelCap - this.fuel);
    this.fuel += take;
    return take;
  }

  /* ---------- лётные характеристики ---------- */
  get accelFullMs(){ return this.mass > 0 ? this.engine.thrust/this.mass : 0; }
  accel(){
    if (this.fuel <= 0 || this.overloadStatus().overloaded) return 0;
    return (this.engine.thrust*this.throttle/this.mass)/DU_M;
  }
  flow(){
    if (this.fuel <= 0 || this.engine.isp <= 0) return 0;
    return this.engine.thrust*this.throttle/(this.engine.isp*G0);
  }
  get deltaV(){
    const m0 = this.mass, m1 = this.dryMass;
    return m1 > 0 && m0 > m1 ? this.engine.isp*G0*Math.log(m0/m1) : 0;
  }
  twr(gDu){
    const g = gDu*DU_M;
    return g > 0 ? this.accelFullMs/g : Infinity;
  }
  burnTime(dv, throttle = 1){
    if (dv <= 0 || throttle <= 0 || this.engine.thrust <= 0) return 0;
    const ve = this.engine.isp*G0;
    const m0 = this.mass;
    const m1 = m0*Math.exp(-Math.abs(dv)/ve);
    if (m1 < this.dryMass) return Infinity;
    const mdot = this.engine.thrust*throttle/ve;
    return (m0 - m1)/mdot;
  }
  canAfford(dv){ return Math.abs(dv) <= this.deltaV; }
  consume(dt){
    const used = this.flow()*dt;
    this.fuel = Math.max(0, this.fuel - used);
    return used;
  }
}
