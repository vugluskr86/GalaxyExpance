/** Инвентарь корабля и груз, дрейфующий в космосе. */

import { Item, makeItem } from "./items.js";
import { primaryState, propagate } from "./physics.js";

export class Inventory {
  constructor(list = []){ this.items = list; }
  get massTotal(){ return this.items.reduce((s, it) => s + it.mass, 0); }
  /** Складываем однотипный груз в стопки, модули держим поштучно. */
  add(item){
    if (item.slot === "cargo"){
      const same = this.items.find(i => i.id === item.id);
      if (same){ same.qty += item.qty; return same; }
    }
    this.items.push(item);
    return item;
  }
  remove(item, qty){
    const i = this.items.indexOf(item);
    if (i < 0) return null;
    if (item.slot === "cargo" && qty && qty < item.qty){
      item.qty -= qty;
      return makeItem(item.id, qty);
    }
    this.items.splice(i, 1);
    return item;
  }
  bySlot(slot){ return this.items.filter(i => i.slot === slot); }
  count(id){ return this.items.filter(i => i.id === id).reduce((s,i) => s + i.qty, 0); }
}

/** Контейнер, брошенный в космос. Летит по настоящей орбите — на рельсах,
 *  тем же кеплеровским решением, что и корабль. */
export class FloatingItem {
  constructor(item, primary, rx, ry, rvx, rvy){
    this.item = item;
    this.primary = { ...primary };
    this.rx = rx; this.ry = ry;
    this.rvx = rvx; this.rvy = rvy;
    this.spin = Math.random()*6.28;
    this.landed = null;          // если сброшен на поверхность: selRef тела
  }
  globPos(sys){
    const ps = primaryState(sys, this.primary);
    if (!ps) return [this.rx, this.ry];
    if (this.landed){
      /* лежит на поверхности: вращается вместе с телом */
      return [ps.x + this.rx, ps.y + this.ry];
    }
    return [ps.x + this.rx, ps.y + this.ry];
  }
  globVel(sys){
    const ps = primaryState(sys, this.primary);
    return ps ? [ps.vx + this.rvx, ps.vy + this.rvy] : [this.rvx, this.rvy];
  }
  update(dt, sys){
    if (this.landed) return;
    const ps = primaryState(sys, this.primary);
    if (!ps || ps.mu <= 0) return;
    const s = propagate(ps.mu, this.rx, this.ry, this.rvx, this.rvy, dt);
    this.rx = s.rx; this.ry = s.ry; this.rvx = s.vx; this.rvy = s.vy;
    const r = Math.hypot(this.rx, this.ry);
    if (r < ps.bodyR){                       // упал на поверхность
      const a = Math.atan2(this.ry, this.rx);
      this.rx = Math.cos(a)*ps.bodyR; this.ry = Math.sin(a)*ps.bodyR;
      this.rvx = 0; this.rvy = 0;
      this.landed = { ...this.primary };
    }
    this.spin += dt*0.4;
  }
  draw(sctx, X, Y, t){
    const blink = Math.floor(t*3) % 2;
    sctx.fillStyle = this.landed ? "#8d8798" : "#d9cdb0";
    sctx.fillRect(Math.round(X)-2, Math.round(Y)-1, 4, 3);
    sctx.fillStyle = blink ? "#ffd166" : "#8a7f6d";
    sctx.fillRect(Math.round(X)-2, Math.round(Y)-2, 4, 1);
  }
}

/** Стартовый инвентарь: немного запчастей и груза. */
export function starterInventory(){
  return new Inventory([
    makeItem("eng_lite"), makeItem("tank_s"), makeItem("scoop_basic"),
    makeItem("hull_scout"), makeItem("hull_hauler"), makeItem("hull_courier"), makeItem("hull_interceptor"), makeItem("hull_miner"),
    makeItem("hull_explorer"), makeItem("hull_gunship"), makeItem("hull_corvette"),
    makeItem("hull_frigate"), makeItem("hull_freighter"), makeItem("hull_carrier"), makeItem("hull_dreadnought"),
    makeItem("gpu_graphics"), makeItem("cpu_dual"),
    makeItem("ram_32"), makeItem("ram_64"),
    makeItem("drive_chip"), makeItem("drive_crystal"),
    makeItem("drive_installer"),
    makeItem("wpn_laser"), makeItem("wpn_energy"), makeItem("wpn_kinetic"),
    makeItem("wpn_missile"), makeItem("wpn_torpedo"), makeItem("wpn_emp"),
    makeItem("wpn_nuclear"), makeItem("wpn_mine"),
    makeItem("reactor_mk1"), makeItem("reactor_mk3"), makeItem("reactor_mk4"),
    makeItem("shield_s"), makeItem("shield_m"), makeItem("shield_l"), makeItem("shield_x"),
    makeItem("droid_s"), makeItem("droid_m"), makeItem("droid_l"), makeItem("droid_x"),
    makeItem("ore_fe", 4), makeItem("probe", 1)
  ]);
}
