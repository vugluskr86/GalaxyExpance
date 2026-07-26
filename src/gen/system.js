import { mulberry32, hash2i } from "../core/rng.js";
import { bakePlanet, genMoons } from "./planet.js";
import { bakeStar, starDiam } from "./star.js";
import { bakeBH } from "./blackhole.js";
import { CLS } from "./starclass.js";

export const LETTERS = "bcdefgh";
export const ROM = ["I","II","III","IV"];

function zoneTypes(dist){
  if (dist < 85) return ["lava","desert","moon","desert"];
  if (dist < 125) return ["terran","ocean","desert","alien","terran"];
  return ["gas","ice","alien","gas","moon"];
}

/** Система из звезды галактики. Первые вызовы rng совпадают с Galaxy.starInfo —
 *  карточка каталога и реальная система всегда сходятся. */
export function buildSystem(galaxy, gs){
  if (gs.kind === "smbh" || gs.kind === "qso"){
    const seed = gs.kind === "qso"
      ? hash2i(Math.round(gs.x), Math.round(gs.y), galaxy.def.seed ^ 0x9a5a)
      : (galaxy.def.seed ^ 0xc03e);
    const rng = mulberry32(seed);
    const bh = { seed, D: 118, colKey: gs.kind === "qso" ? "blue" : "hot" };
    bakeBH(bh);
    const sstars = [];
    const n = 4 + Math.floor(rng()*4);
    for(let i=0;i<n;i++){
      sstars.push({ a: 95 + rng()*80, e: 0.45 + rng()*0.35,
        om: rng()*Math.PI*2, th: rng()*Math.PI*2, dir: rng()<0.5?1:-1,
        ci: Math.floor(rng()*5), r:100, x:0, y:0 });
    }
    return { bhOnly:true, jets: gs.kind === "qso", jetAng: gs.jetAng || 1.2,
             bh, sstars, star: gs, name: gs.name, planets: [], comets: [], belt: null };
  }
  const seed = galaxy.systemSeedOf(gs);
  const rng = mulberry32(seed);
  const nPlanets = Math.floor(rng()*8);       // = starInfo().planets
  const hasBelt = rng() < 0.35;               // = starInfo().belt
  const cls = CLS[gs.ci];
  const sun = { temp: Math.round(cls.temp*(0.9 + rng()*0.2)), seed: seed ^ 0xa, D:0, rot:0 };
  sun.D = sun.temp < 2500 ? 24 : starDiam(sun.temp);
  bakeStar(sun);
  const planets = [];
  const R0 = sun.D/2 + 28;
  const step = nPlanets > 0 ? (168 - R0)/nPlanets : 0;
  for(let i=0;i<nPlanets;i++){
    const dist = Math.round(R0 + step*i + rng()*step*0.4);
    const zt = zoneTypes(dist);
    const type = zt[Math.floor(rng()*zt.length)];
    const gas = type === "gas";
    const p = {
      type, seed: Math.floor(rng()*99999),
      size: gas ? 28 + 2*Math.floor(rng()*8) : 14 + 2*Math.floor(rng()*7),
      dist,
      rings: gas && rng() < 0.55,
      clouds: (type === "terran" || type === "ocean" || gas) && rng() < 0.8,
      moons: gas ? 1 + Math.floor(rng()*4) : Math.floor(rng()*2.4),
      ang: rng()*Math.PI*2
    };
    bakePlanet(p);
    genMoons(p, rng);
    planets.push(p);
  }
  let belt = null;
  if (hasBelt){
    const rB = 78 + rng()*76, width = 9 + rng()*8;
    const rocks = [];
    const n = 110 + Math.floor(rng()*40);
    const COLS = ["#8d8798","#6b6675","#7a6a55","#57525f","#4a4652"];
    for(let i=0;i<n;i++){
      const dist = rB + (rng()+rng()-1)*width;
      rocks.push({ dist, ang: rng()*Math.PI*2,
        w: 200/Math.pow(dist,1.5)*(0.9+rng()*0.2),
        s: rng()<0.2?2:1, c: COLS[Math.floor(rng()*COLS.length)],
        num: 100 + Math.floor(rng()*8900), rseed: Math.floor(rng()*99999) });
    }
    belt = { rocks };
  }
  const comets = [];
  const nc = rng() < 0.6 ? 1 : (rng() < 0.5 ? 2 : 0);
  for(let i=0;i<nc;i++){
    comets.push({ a: 130 + rng()*90, e: 0.5 + rng()*0.26,
      om: rng()*Math.PI*2, th: rng()*Math.PI*2, ph: rng()*10,
      dir: rng()<0.5?1:-1, r:100, x:0, y:0,
      id: 1000 + Math.floor(rng()*9000) });
  }
  let neb = null;
  if (rng() < 0.6){
    neb = { hue: Math.floor(rng()*5), dens: 0.8 + rng()*0.6,
            scale: 0.8 + rng()*0.8, seed: Math.floor(rng()*1e9) };
  }
  return { star: gs, sun, planets, belt, comets, neb,
           name: gs.name || galaxy.fieldName(gs) };
}

export function stepSystem(S, dt){
  if (!S) return;
  if (S.bhOnly){
    for(const s of S.sstars){
      s.r = s.a*(1 - s.e*s.e)/(1 + s.e*Math.cos(s.th));
      s.th += s.dir*(2600/(s.r*s.r))*dt;
      s.x = Math.cos(s.th + s.om)*s.r;
      s.y = Math.sin(s.th + s.om)*s.r;
    }
    return;
  }
  S.sun.rot += 0.10*dt;
  for(const p of S.planets){
    const w = 200/Math.pow(p.dist, 1.5);
    p.ang += w*dt;
    p.rot += p.spin*dt*0.5;
    p.crot += p.spin*dt*0.7;
    p._x = Math.cos(p.ang)*p.dist;
    p._y = Math.sin(p.ang)*p.dist;
    for(const m of p.moonList){
      m.ang += m.w*dt;
      m._x = p._x + Math.cos(m.ang)*m.orbR;
      m._y = p._y + Math.sin(m.ang)*m.orbR;
    }
  }
  if (S.belt) for(const r of S.belt.rocks) r.ang += r.w*dt;
  for(const c of S.comets){
    c.r = c.a*(1 - c.e*c.e)/(1 + c.e*Math.cos(c.th));
    c.th += c.dir*(1200/(c.r*c.r))*dt;
    c.x = Math.cos(c.th + c.om)*c.r;
    c.y = Math.sin(c.th + c.om)*c.r;
  }
}
export function lightAt(wx, wy){
  const ln = Math.sqrt(wx*wx + wy*wy) || 1;
  let lx = -wx/ln, ly = -wy/ln, lz = 0.45;
  const n = Math.sqrt(lx*lx + ly*ly + lz*lz);
  return [lx/n, ly/n, lz/n];
}
