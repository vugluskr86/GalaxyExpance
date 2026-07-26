import { mulberry32, hash2i } from "../core/rng.js";
import { nameFromHash } from "../core/naming.js";

/** Радиус тела для расчёта орбиты (у комет/обломков — малое ядро). */
export function bodyRadius(o){
  return o && o.size ? o.size/2 : 4;
}

/** Корабль в координатах системы: полёт к цели → круговая орбита на заданной высоте.
 *  Цель — любой selRef системы: планета, луна, комета, обломок пояса, звезда. */
export class Ship {
  constructor(x, y, col){
    this.x = x; this.y = y;
    this.ang = 0;
    this.col = col;
    this.state = "idle";        // idle | fly | orbit | landed
    this.target = null;         // selRef {kind,i,j}
    this.speed = 58;
    this.altitude = 14;         // высота орбиты над поверхностью
    this.orbitR = 0;
    this.orbitA = 0;
  }
  /** Выйти на орбиту вокруг любого тела на высоте alt (по умолчанию текущая). */
  orbitAt(selRef, alt){
    this.state = "fly";
    this.target = { ...selRef };
    if (alt !== undefined) this.altitude = alt;
  }
  flyTo(selRef, alt){ this.orbitAt(selRef, alt); }
  sameTarget(selRef){
    return this.target && selRef &&
      this.target.kind === selRef.kind && this.target.i === selRef.i && this.target.j === selRef.j;
  }
  update(dt, sys){
    if (this.state === "landed") return;
    if (this.state === "fly"){
      const pos = sys.posOf(this.target);
      const o = sys.obj(this.target);
      if (!pos || !o){ this.state = "idle"; return; }
      const dx = pos[0] - this.x, dy = pos[1] - this.y;
      const d = Math.hypot(dx, dy);
      const want = Math.atan2(dy, dx);
      let da = want - this.ang;
      while(da > Math.PI) da -= 2*Math.PI;
      while(da < -Math.PI) da += 2*Math.PI;
      this.ang += Math.max(-3*dt, Math.min(3*dt, da));
      this.x += Math.cos(this.ang)*this.speed*dt;
      this.y += Math.sin(this.ang)*this.speed*dt;
      const rr = bodyRadius(o) + this.altitude;
      if (d < rr + 6){
        this.state = "orbit";
        this.orbitR = rr;
        this.orbitA = Math.atan2(this.y - pos[1], this.x - pos[0]);
        sys.mgr?.onChange?.();
      }
    } else if (this.state === "orbit"){
      const pos = sys.posOf(this.target);
      if (!pos){ this.state = "idle"; return; }
      this.orbitA += (70/this.orbitR)*dt;
      this.x = pos[0] + Math.cos(this.orbitA)*this.orbitR;
      this.y = pos[1] + Math.sin(this.orbitA)*this.orbitR;
      this.ang = this.orbitA + Math.PI/2;
    }
  }
  draw(sctx, X, Y, t){
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    sctx.fillStyle = this.col;
    sctx.fillRect(Math.round(X + c*3)-1, Math.round(Y + s*3)-1, 2, 2);
    sctx.fillRect(Math.round(X)-1, Math.round(Y)-1, 2, 2);
    sctx.fillRect(Math.round(X - c*2 - s*2), Math.round(Y - s*2 + c*2), 1, 1);
    sctx.fillRect(Math.round(X - c*2 + s*2), Math.round(Y - s*2 - c*2), 1, 1);
    if (this.state === "fly" && Math.floor(t*12) % 2){
      sctx.fillStyle = "#ffd166";
      sctx.fillRect(Math.round(X - c*4), Math.round(Y - s*4), 1, 1);
    }
  }
}

/** NPC: автономный «мозг» — летает между планетами, крутится на орбитах. */
export class Npc {
  constructor(ship, name){
    this.ship = ship;
    this.name = name;
    this.timer = 2 + Math.random()*4;
  }
  update(dt, sys){
    this.ship.update(dt, sys);
    if (this.ship.state === "fly") return;
    this.timer -= dt;
    if (this.timer <= 0 && sys.S.planets.length){
      const i = Math.floor(Math.random()*sys.S.planets.length);
      this.ship.flyTo({ kind:"planet", i, j:0 });
      this.timer = 6 + Math.random()*8;
    }
  }
}

export function makeNpcs(S, seed){
  if (S.bhOnly || !S.planets.length) return [];
  const rng = mulberry32(seed ^ 0x0c9c);
  const n = 1 + Math.floor(rng()*2);
  const npcs = [];
  const ROLES = ["Торговец", "Патруль", "Геолог", "Курьер"];
  for(let i=0;i<n;i++){
    const pi = Math.floor(rng()*S.planets.length);
    const p = S.planets[pi];
    const ship = new Ship(Math.cos(rng()*6.28)*p.dist, Math.sin(rng()*6.28)*p.dist, "#6fb7ff");
    ship.flyTo({ kind:"planet", i:pi, j:0 });
    npcs.push(new Npc(ship,
      ROLES[Math.floor(rng()*ROLES.length)] + " «" + nameFromHash(hash2i(i, 71, seed)) + "»"));
  }
  return npcs;
}
