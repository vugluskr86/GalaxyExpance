import { mulberry32, hash2i } from "../core/rng.js";
import { BAYER, hex2rgb, lerp3 } from "../core/color.js";
import { nameFromHash } from "../core/naming.js";
import { classFromRoll } from "./starclass.js";
import { bakeBH } from "./blackhole.js";

export const SECT = 24;      // сторона сектора, мировые единицы
export const BGRID = 48;     // сетка навигационного каталога (константа — NAV-коды стабильны)

const TINTS = {
  spiral:    ["#ffd9a0", "#6f9fe8"],
  globular:  ["#ffe3b0", "#d8a86a"],
  elliptical:["#ffeccb", "#c9b48a"]
};

/** Случайные структурные параметры галактики из её зерна (для кластера). */
export function randomGalaxyDef(seed){
  const rng = mulberry32(seed ^ 0x777);
  return {
    seed,
    type: ["spiral","spiral","spiral","globular","elliptical"][Math.floor(rng()*5)],
    R: 550 + Math.floor(rng()*10)*70,
    dens: 0.8 + rng()*0.6,
    blue: 0.25 + rng()*0.5,
    arms: 2 + Math.floor(rng()*4),
    swirl: 3 + Math.floor(rng()*9)*0.5,
    armW: 1.5 + Math.floor(rng()*9)*0.5,
    bar: Math.floor(rng()*7)*0.05,
    core: 0.08 + Math.floor(rng()*16)*0.01,
    conc: 1.8 + Math.floor(rng()*15)*0.1,
    flat: 0.55 + Math.floor(rng()*9)*0.05,
    smbh: rng() < 0.8
  };
}

/** Поле плотности по def — статическое, чтобы кластер мог печь миниатюры без Galaxy. */
export function densityOfDef(def, barAng, x, y, armOut){
  const R = def.R;
  if (def.type === "globular"){
    const re = Math.hypot(x, y/def.flat)/R;
    if (re > 1.1) return 0;
    return Math.min(1, Math.pow(1 + Math.pow(re/def.core, 2), -def.conc)*1.1);
  }
  if (def.type === "elliptical"){
    const re = Math.hypot(x, y/def.flat)/R;
    if (re > 1.1) return 0;
    return Math.min(1, Math.exp(-4.6*Math.sqrt(re)) * (1 + 0.8*Math.exp(-re*re/(2*def.core*def.core))));
  }
  const rr = Math.hypot(x, y)/R;
  if (rr > 1.12) return 0;
  const bulge = Math.exp(-(rr*rr)/(2*def.core*def.core));
  let d = bulge*1.25 + Math.exp(-rr/0.42)*0.22;
  if (def.bar > 0.02){
    const cb = Math.cos(barAng), sb = Math.sin(barAng);
    const u = (x*cb + y*sb)/(def.bar*R), v = (-x*sb + y*cb)/(def.bar*R*0.32);
    d += Math.exp(-(u*u + v*v))*0.75;
  }
  let af = 0;
  if (rr > 0.04){
    const th = Math.atan2(y, x);
    const p = def.arms*th - def.swirl*Math.log(rr + 0.001);
    af = Math.pow(0.5 + 0.5*Math.cos(p), def.armW);
    d += Math.exp(-rr/0.5) * af;
  }
  if (armOut) armOut.v = af;
  return Math.min(1, d/1.45);
}

/** Галактика: сектора звёзд (LRU), каталог-маяки, квазары, ядро-ЧД, пыль. */
export class Galaxy {
  constructor(def){
    this.def = def;
    const rng = mulberry32(def.seed ^ 0x6a1a);
    this.barAng = rng()*Math.PI;
    this.name = nameFromHash(def.seed ^ 0x6a1a3);
    this.cache = new Map();
    this.CACHE_MAX = 1000;
    this.beacons = [];
    this.quasars = [];
    this.nebulae = [];
    this.coreBH = null;
    this.dustCvs = document.createElement("canvas");
    this.dustSpan = 0;
    this.rebuild();
  }
  density(x, y, armOut){ return densityOfDef(this.def, this.barAng, x, y, armOut); }
  armBias(x, y){
    if (this.def.type !== "spiral") return 0.4;
    const rr = Math.hypot(x, y)/this.def.R;
    if (rr <= 0.04) return 0.4;
    const th = Math.atan2(y, x);
    const p = this.def.arms*th - this.def.swirl*Math.log(rr + 0.001);
    return Math.pow(0.5 + 0.5*Math.cos(p), this.def.armW);
  }
  rebuild(){
    this.cache.clear();
    this.genBeacons();
    this.genQuasars();
    this.genNebulae();
    this.coreBH = null;
    if (this.def.smbh){
      this.coreBH = { seed: this.def.seed ^ 0xc03e, D: 44, colKey:"hot" };
      bakeBH(this.coreBH);
    }
  }
  sectorStars(sx, sy){
    const key = sx + "," + sy;
    const hit = this.cache.get(key);
    if (hit){ this.cache.delete(key); this.cache.set(key, hit); return hit; }
    const def = this.def;
    const h = hash2i(sx, sy, def.seed);
    const rng = mulberry32(h);
    const cx = (sx + 0.5)*SECT, cy = (sy + 0.5)*SECT;
    const dBase = this.density(cx, cy);
    const lam = dBase * 9 * def.dens;
    let n = Math.floor(lam) + (rng() < (lam % 1) ? 1 : 0);
    n = Math.min(n, 14);
    const stars = [];
    for(let i=0;i<n;i++){
      const x = (sx + rng())*SECT, y = (sy + rng())*SECT;
      const dLoc = this.density(x, y);
      if (dLoc < rng()*dBase*1.15) continue;
      const ci = classFromRoll(rng(), this.armBias(x, y), def.blue);
      stars.push({ x, y, ci, lum: 0.7 + rng()*0.3, ph: rng()*6.28, sx, sy, k: i });
    }
    this.cache.set(key, stars);
    if (this.cache.size > this.CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
    return stars;
  }
  genBeacons(){
    this.beacons = [];
    const def = this.def;
    const span = def.R*2.3;
    const cs = span/BGRID;
    for(let j=0;j<BGRID;j++){
      for(let i=0;i<BGRID;i++){
        const h = hash2i(i + 7000, j + 7000, def.seed ^ 0xbeac);
        const rng = mulberry32(h);
        const x = -span/2 + (i + rng())*cs;
        const y = -span/2 + (j + rng())*cs;
        const d = this.density(x, y);
        if (rng() > d*1.15) continue;
        let ci = classFromRoll(rng(), Math.max(this.armBias(x, y), 0.5), def.blue);
        if (ci > 4) ci -= 2;
        ci = Math.min(ci, 6);
        const idx = j*BGRID + i;
        this.beacons.push({
          x, y, ci, lum: 1, ph: rng()*6.28,
          name: nameFromHash(h ^ 0x5a17),
          desig: "NAV-" + idx.toString(36).toUpperCase().padStart(3, "0"),
          idx
        });
      }
    }
  }
  genQuasars(){
    this.quasars = [];
    const def = this.def;
    const rng = mulberry32(def.seed ^ 0x9a5a);
    const n = Math.floor(rng()*4);
    for(let i=0;i<n;i++){
      const a = rng()*Math.PI*2, r = def.R*(0.72 + rng()*0.42);
      this.quasars.push({
        kind:"qso", x: Math.cos(a)*r, y: Math.sin(a)*r,
        jetAng: rng()*Math.PI, ph: rng()*6.28,
        name: "QSO " + nameFromHash(hash2i(i, 99, def.seed ^ 0x9a5a)).replace(/ .*/, ""),
        desig: "QSO-" + (i+1),
        z: (0.8 + rng()*3).toFixed(2)
      });
    }
  }
  genNebulae(){
    this.nebulae = [];
    const def = this.def;
    const rng = mulberry32(def.seed ^ 0x2eb);
    const n = 2 + Math.floor(rng()*3);
    for(let i=0;i<n;i++){
      const a = rng()*Math.PI*2, r = def.R*(0.18 + rng()*0.72);
      this.nebulae.push({
        kind:"neb",
        x: Math.cos(a)*r, y: Math.sin(a)*r,
        R: 60 + rng()*90,
        hue: Math.floor(rng()*5),
        seed: hash2i(i, 313, def.seed ^ 0x2eb),
        name: "Туманность " + nameFromHash(hash2i(i, 414, def.seed ^ 0x2eb)),
        desig: "NEB-" + (i+1)
      });
    }
  }
  /** Детерминированное имя сектора (для навигации и карточек). */
  sectorName(sx, sy){
    return nameFromHash(hash2i(sx*3 + 701, sy*5 - 311, this.def.seed ^ 0x5ec7));
  }
  smbhObj(){
    if (!this.def.smbh) return null;
    return { kind:"smbh", x:0, y:0, name: this.name + " A*", desig:"SMBH-0", jetAng: 1.2 };
  }
  fieldDesig(s){ return "FLD-" + (s.sx + 500) + "-" + (s.sy + 500) + "-" + s.k; }
  fieldName(s){ return nameFromHash(hash2i(s.sx*31 + s.k, s.sy*17 - s.k, this.def.seed ^ 0xf1e1d)); }
  systemSeedOf(s){ return hash2i(Math.round(s.x*3), Math.round(s.y*3), this.def.seed ^ 0x9147); }
  starInfo(s){
    const rng = mulberry32(this.systemSeedOf(s));
    return { planets: Math.floor(rng()*8), belt: rng() < 0.35 };
  }
  resolveCode(qU){
    let m = qU.match(/^NAV-([0-9A-Z]+)$/);
    if (m){ const idx = parseInt(m[1], 36); return this.beacons.find(b => b.idx === idx) || null; }
    m = qU.match(/^FLD-(\d+)-(\d+)-(\d+)$/);
    if (m){
      const sx = parseInt(m[1]) - 500, sy = parseInt(m[2]) - 500, k = parseInt(m[3]);
      const s = this.sectorStars(sx, sy).find(st => st.k === k);
      if (s) return { ...s, name: this.fieldName(s), desig: this.fieldDesig(s) };
    }
    return null;
  }
  searchPrefix(qU){
    const specials = this.quasars.concat(this.nebulae)
      .concat(this.def.smbh ? [this.smbhObj()] : []);
    const spHit = specials.filter(o => o.name.toUpperCase().startsWith(qU) || o.desig === qU);
    return spHit.concat(this.beacons.filter(b => b.name.toUpperCase().startsWith(qU)));
  }
  bakeDust(res, dustAlpha){
    const N = res;
    this.dustCvs.width = N; this.dustCvs.height = N;
    this.dustSpan = this.def.R*2.4;
    const ctx = this.dustCvs.getContext("2d");
    const img = ctx.createImageData(N, N);
    const d = img.data;
    const [t1, t2] = TINTS[this.def.type];
    const c1 = hex2rgb(t1), c2 = hex2rgb(t2);
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        const o = (y*N + x)*4;
        const wx = (x/N - 0.5)*this.dustSpan, wy = (y/N - 0.5)*this.dustSpan;
        const dv = this.density(wx, wy);
        const bay = BAYER[(y & 3)*4 + (x & 3)];
        const a = dv*dustAlpha;
        if (a + bay*0.06 <= 0.03){ d[o+3]=0; continue; }
        const rr = Math.min(1, Math.hypot(wx, wy)/this.def.R*1.4);
        const col = lerp3(c1, c2, rr);
        d[o]=col[0]; d[o+1]=col[1]; d[o+2]=col[2];
        d[o+3] = a > 0.5 ? 88 : (a > 0.25 ? 60 : (a > 0.1 ? 36 : 18));
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
