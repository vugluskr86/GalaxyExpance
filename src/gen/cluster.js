import { mulberry32, hash2i } from "../core/rng.js";
import { BAYER, hex2rgb, lerp3 } from "../core/color.js";
import { nameFromHash } from "../core/naming.js";
import { randomGalaxyDef, densityOfDef } from "./galaxy.js";

/** Кластер галактик: верхний уровень. Каждая галактика — только def + позиция,
 *  тяжёлые ассеты печёт GalaxyScene при входе. */
export class Cluster {
  constructor(seed, opts = {}){
    this.seed = seed;
    this.count = opts.count ?? 30;
    this.spread = opts.spread ?? 4200;
    this.name = "Кластер " + nameFromHash(seed ^ 0xc1a5);
    this.galaxies = [];
    this.build();
  }
  setSeed(seed){
    this.seed = seed;
    this.name = "Кластер " + nameFromHash(seed ^ 0xc1a5);
    this.build();
  }
  build(){
    this.galaxies = [];
    const rng = mulberry32(this.seed ^ 0xc1a57e);
    const nGroups = 3 + Math.floor(rng()*4);
    const groups = [];
    for(let g=0; g<nGroups; g++){
      groups.push({
        x: (rng()-0.5)*this.spread*0.8,
        y: (rng()-0.5)*this.spread*0.8,
        s: this.spread*(0.10 + rng()*0.14)
      });
    }
    for(let i=0; i<this.count; i++){
      const g = groups[Math.floor(rng()*groups.length)];
      const a = rng()*Math.PI*2, r = (rng()+rng())*0.5*g.s;
      const gseed = hash2i(i, 1717, this.seed);
      const def = randomGalaxyDef(gseed);
      this.galaxies.push({
        def,
        x: g.x + Math.cos(a)*r,
        y: g.y + Math.sin(a)*r,
        spriteRot: rng()*Math.PI*2,
        ph: rng()*6.28,
        name: "Галактика " + nameFromHash(def.seed ^ 0x6a1a3),
        desig: "GAL-" + String(i+1).padStart(2, "0"),
        idx: i,
        rv: def.R/6.5          // визуальный радиус в координатах кластера
      });
    }
  }
  /** Миниатюра галактики (печётся лениво, кэшируется на объекте). */
  thumb(gal){
    if (gal._thumb) return gal._thumb;
    const N = 72;
    const cvs = document.createElement("canvas");
    cvs.width = N; cvs.height = N;
    const ctx = cvs.getContext("2d");
    const img = ctx.createImageData(N, N);
    const d = img.data;
    const def = gal.def;
    const barAng = mulberry32(def.seed ^ 0x6a1a)()*Math.PI;
    const span = def.R*2.4;
    const TINT = { spiral:["#ffd9a0","#6f9fe8"], globular:["#ffe3b0","#d8a86a"], elliptical:["#ffeccb","#c9b48a"] };
    const [t1, t2] = TINT[def.type];
    const c1 = hex2rgb(t1), c2 = hex2rgb(t2);
    const cs = Math.cos(gal.spriteRot), sn = Math.sin(gal.spriteRot);
    const srng = mulberry32(def.seed ^ 0x77);
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        const o = (y*N + x)*4;
        const ux = (x/N - 0.5)*span, uy = (y/N - 0.5)*span;
        const wx = ux*cs - uy*sn, wy = ux*sn + uy*cs;
        const dv = densityOfDef(def, barAng, wx, wy);
        const bay = BAYER[(y & 3)*4 + (x & 3)];
        if (dv + bay*0.08 <= 0.05){ d[o+3]=0; continue; }
        const rr = Math.min(1, Math.hypot(wx, wy)/def.R*1.4);
        const col = lerp3(c1, c2, rr);
        d[o]=col[0]; d[o+1]=col[1]; d[o+2]=col[2];
        d[o+3] = dv > 0.55 ? 190 : (dv > 0.3 ? 130 : (dv > 0.12 ? 80 : 40));
      }
    }
    // несколько ярких звёзд-искр поверх
    for(let k=0;k<10;k++){
      const px = Math.floor(srng()*N), py = Math.floor(srng()*N);
      const o = (py*N + px)*4;
      if (d[o+3] > 60){ d[o]=235; d[o+1]=240; d[o+2]=255; d[o+3]=230; }
    }
    ctx.putImageData(img, 0, 0);
    gal._thumb = cvs;
    return cvs;
  }
  searchPrefix(qU){
    return this.galaxies.filter(g =>
      g.name.toUpperCase().includes(qU) || g.desig === qU);
  }
}
