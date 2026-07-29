/** Конфигурация корабля: слоты, топливо, трюм.
 *
 *  Раньше двигатель и бак были жёстко зашитыми списками; теперь это
 *  предметы из каталога (items.js), установленные в слоты. Внешний API
 *  сохранён — Ship и сцены продолжают читать prop.engine.thrust и т.д. */

import { G0, DU_M } from "./units.js";
import { makeItem, byId, bySlot, SLOTS, itemSlotFor } from "./items.js";
import { Inventory, starterInventory } from "./inventory.js";

/* Совместимость: прежние экспорты собираются из каталога. */
export const ENGINES = bySlot("engine").map(d => ({
  id:d.id, name:d.name, thrust:d.stats.thrust, isp:d.stats.isp, mass:d.mass }));
export const TANKS = bySlot("tank").map(d => ({
  id:d.id, name:d.name, dry:d.mass, fuel:d.stats.cap }));
export const HULL_MASS = 5.0;

export class Propulsion {
  constructor(engineId = "eng_main", tankId = "tank_m",
              hullId = "hull_std", scoopId = "scoop_fuel"){
    this.slots = {
      hull:   makeItem(hullId),
      engine: makeItem(engineId),
      tank:   makeItem(tankId),
      scoop:  scoopId ? makeItem(scoopId) : null,
      shield: null,
      droid: null,
      reactor: makeItem("reactor_mk2"),
      weapon1: null, weapon2: null, weapon3: null, weapon4: null, weapon5: null,
      computer: makeItem("comp_expand"),
    };
    this.fuel = this.slots.tank.stats.cap;
    this.throttle = 0;
    this.activeWeaponSlot = "weapon1";
    this.inventory = starterInventory();
    this.cargo = new Inventory([]);       // то, что лежит в трюме корабля
    this.scooping = false;
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
    return SLOTS.filter(slot=>{
      if(slot.id==="scoop")return stats.scoopSlot!==false;
      if(slot.id==="shield")return stats.shieldSlot!==false;
      if(slot.id==="droid")return stats.droidSlot!==false;
      if(slot.id.startsWith("weapon"))return Number(slot.id.slice(6))<=weapons;
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
  tickWeapons(dt){
    for(const weapon of this.weapons)weapon.cooldownLeft=Math.max(0,(weapon.cooldownLeft||0)-Math.max(0,dt));
  }
  tickSystems(dt){
    const shield=this.shield,reactor=this.reactor;
    if(!shield)return;
    shield.charge ??= shield.stats.capacity;
    const power=Math.max(0.25,(reactor?.stats.power||0)/80);
    shield.charge=Math.min(shield.stats.capacity,shield.charge+shield.stats.regen*power*Math.max(0,dt));
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
    }else slot=item.slot;
    if(!slot||!this.slots.hasOwnProperty(slot)||!this.slotAvailable(slot)||this.itemType(slot)!==item.slot)return null;
    const old=this.slots[slot];this.slots[slot]=item;
    if (item.slot === "tank") this.fuel = Math.min(this.fuel, item.stats.cap);
    return old;
  }
  /** Снимает модуль из слота (корпус снять нельзя). */
  uninstall(slot){
    if (slot === "hull" || !this.slotAvailable(slot)) return null;
    const it = this.slots[slot];
    if (!it) return null;
    this.slots[slot] = null;
    return it;
  }

  /* ---------- массы ---------- */
  get moduleMass(){
    return Object.values(this.slots).reduce((s, it) => s + (it ? it.mass : 0), 0);
  }
  get cargoMass(){ return this.cargo.massTotal; }
  get cargoCap(){ return this.hull.cargo; }
  get dryMass(){ return this.moduleMass + this.cargoMass; }
  get mass(){ return this.dryMass + this.fuel; }
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
    if (this.fuel <= 0) return 0;
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
