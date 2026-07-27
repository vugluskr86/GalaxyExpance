/** Двигательная установка: двигатель, бак, тяга, ΔV по Циолковскому.
 *  Всё в инженерных единицах — тонны, килоньютоны, секунды удельного
 *  импульса, м/с — чтобы цифры читались как в KSP. */

import { G0, DU_M } from "./units.js";

export const ENGINES = [
  { id:"ion",    name:"Ионный «Тень»",     thrust:  18, isp: 3800, mass:0.9 },
  { id:"lite",   name:"Маневровый LT-3",   thrust: 120, isp:  340, mass:0.6 },
  { id:"main",   name:"Основной M-7",      thrust: 240, isp:  380, mass:1.4 },
  { id:"heavy",  name:"Тяжёлый «Овен»",    thrust: 680, isp:  310, mass:3.2 },
  { id:"nuke",   name:"Ядерный NERV-2",    thrust: 160, isp:  850, mass:2.8 }
];
export const TANKS = [
  { id:"t1", name:"Бак малый",   dry:0.9, fuel: 8 },
  { id:"t2", name:"Бак средний", dry:2.0, fuel:22 },
  { id:"t3", name:"Бак большой", dry:4.2, fuel:52 }
];
export const HULL_MASS = 5.0;          // корпус, кабина, оборудование, т

export class Propulsion {
  constructor(engineId = "main", tankId = "t2"){
    this.engine = ENGINES.find(e => e.id === engineId) || ENGINES[2];
    this.tank   = TANKS.find(t => t.id === tankId) || TANKS[1];
    this.fuel   = this.tank.fuel;       // т
    this.throttle = 0;                  // 0..1
  }
  setEngine(id){
    const e = ENGINES.find(x => x.id === id);
    if (e) this.engine = e;
  }
  setTank(id){
    const t = TANKS.find(x => x.id === id);
    if (!t) return;
    const frac = this.fuel/this.tank.fuel;
    this.tank = t;
    this.fuel = t.fuel*Math.min(1, frac);
  }
  refuel(){ this.fuel = this.tank.fuel; }

  get dryMass(){ return HULL_MASS + this.engine.mass + this.tank.dry; }
  get mass(){ return this.dryMass + this.fuel; }             // т
  get fuelFrac(){ return this.tank.fuel > 0 ? this.fuel/this.tank.fuel : 0; }

  /** Полное ускорение при 100 % тяги, м/с². */
  get accelFullMs(){ return this.engine.thrust / this.mass; }
  /** Текущее ускорение с учётом РУД, du/с². */
  accel(){
    if (this.fuel <= 0) return 0;
    return (this.engine.thrust*this.throttle / this.mass) / DU_M;
  }
  /** Расход, т/с при текущем РУД. */
  flow(){
    if (this.fuel <= 0) return 0;
    return this.engine.thrust*this.throttle*1000/(this.engine.isp*G0) / 1000;
  }
  /** Запас характеристической скорости, м/с. */
  get deltaV(){
    const m0 = this.mass, m1 = this.dryMass;
    return m1 > 0 && m0 > m1 ? this.engine.isp*G0*Math.log(m0/m1) : 0;
  }
  /** Тяговооружённость относительно ускорения свободного падения g (du/с²). */
  twr(gDu){
    const g = gDu*DU_M;
    return g > 0 ? this.accelFullMs/g : Infinity;
  }
  /** Длительность манёвра на dv (м/с) при заданном РУД — учитывает
   *  облегчение корабля по мере выгорания топлива. */
  burnTime(dv, throttle = 1){
    if (dv <= 0 || throttle <= 0) return 0;
    const ve = this.engine.isp*G0;
    const m0 = this.mass;
    const m1 = m0*Math.exp(-Math.abs(dv)/ve);
    if (m1 < this.dryMass) return Infinity;                 // топлива не хватит
    const mdot = this.engine.thrust*throttle/ve;            // т/с
    return (m0 - m1)/mdot;
  }
  /** Хватит ли топлива на dv. */
  canAfford(dv){ return Math.abs(dv) <= this.deltaV; }
  /** Списать топливо за dt работы двигателя. */
  consume(dt){
    const used = this.flow()*dt;
    this.fuel = Math.max(0, this.fuel - used);
    return used;
  }
}
