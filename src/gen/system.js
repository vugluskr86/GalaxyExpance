import { mulberry32, hash2i } from "../core/rng.js";
import { bakePlanet, genMoons, makeSurfaceProfile } from "./planet.js";
import { bakeStar, starDiam } from "./star.js";
import { bakeBH } from "./blackhole.js";
import { CLS } from "./starclass.js";
import { MU_SUN } from "../game/units.js";
import { muOf, orbitRate, fitMoonOrbits } from "../game/physics.js";
import { systemId, planetId, moonId } from "../core/ids.js";
import { authorityFor } from "../game/factions.js";
import { stationsForSettlement } from "../game/stations.js";

/** Скорость собственного вращения тел (сутки ≈ 6–20 часов симуляции). */
const SPIN_SCALE = 2.6e-4;

export const LETTERS = "bcdefgh";
export const ROM = ["I","II","III","IV"];

/*
 * Константы генерации звёздной системы.
 * Все расстояния — в условных пикселях (px), масштаб 1 px ≈ 0.003–0.01 а.е.
 */

/** Максимальный радиус системы (крайняя орбита), px. */
const SYSTEM_SPAN = 700;

/** Внутренняя граница горячей зоны: ближе — лава/пустыня/мёртвый мир, px. */
const ZONE_HOT = 250;
/** Внешняя граница зоны обитаемости: дальше — газовые гиганты/холодные миры, px. */
const ZONE_HAB = 450;

/** Минимальное расстояние от центра звезды до первой планеты: радиус звезды + отступ, px. */
const ORBIT_MIN_PAD = 60;

/** Планет: от 0 до N-1 (генерируется rng). */
const PLANETS_MAX = 8;

/**
 * Размеры планетарных тел, px (диаметр текстуры).
 * Не привязаны к физическому радиусу гравполя — bodyR всегда = size/2.
 */
/** Базовый диаметр каменистой планеты/луны, px. */
const ROCKY_SIZE_BASE = 14;
/** Разброс диаметра каменистого тела (чётные шаги), px. */
const ROCKY_SIZE_VAR = 7;
/** Базовый диаметр газового гиганта, px. */
const GAS_SIZE_BASE = 28;
/** Разброс диаметра газового гиганта (чётные шаги), px. */
const GAS_SIZE_VAR = 8;

/** Вероятность rings у газового гиганта (0–1). */
const GAS_RINGS_CHANCE = 0.55;
/** Вероятность облаков у terran/ocean/gas (0–1). */
const CLOUDS_CHANCE = 0.8;

/** Спутники у газовых гигантов: минимум. */
const MOONS_GAS_MIN = 1;
/** Спутники у газовых гигантов: дополнительный разброс (rng*N). */
const MOONS_GAS_VAR = 4;
/** Спутники у каменистых планет: разброс (rng*N). */
const MOONS_ROCKY_VAR = 2.4;

/* --- Пояс астероидов --- */
/** Вероятность пояса (0–1), должна совпадать с Galaxy.starInfo. */
const BELT_CHANCE = 0.35;
/** Центр пояса: минимальное / максимальное смещение, px. */
const BELT_R_MIN = 250, BELT_R_MAX = 650;
/** Полуширина пояса: базовая + вариативная, px. */
const BELT_W_BASE = 14, BELT_W_VAR = 12;
/** Количество обломков: базовое + разброс. */
const BELT_N_BASE = 110, BELT_N_VAR = 40;

/* --- Кометы --- */
/** Вероятность 1 кометы (иначе 0, 1 или 2). */
const COMET_CHANCE = 0.6;
/** Большая полуось: базовая + разброс, px. */
const COMET_A_BASE = 450, COMET_A_VAR = 300;
/** Эксцентриситет: база + разброс. */
const COMET_E_BASE = 0.5, COMET_E_VAR = 0.26;

/* --- Туманность в системе --- */
/** Вероятность фоновой туманности (0–1). */
const NEBULA_CHANCE = 0.6;

/* ---------------------------------------------------------------- */

function zoneTypes(dist){
  if (dist < ZONE_HOT) return ["lava","venus","mars","desert","moon","lava"];
  if (dist < ZONE_HAB) return ["terran","ocean","jungle","megacity","desert","alien","terran"];
  return ["gas","ice","titan","methane","alien","gas","moon"];
}

/**
 * Поселение — часть базового, а не сохранённого состояния мира. Его свойства
 * получаются только из seed тела: повторная генерация той же системы создаёт
 * тот же профиль рынка. В сохранение позже попадут лишь изменения запасов,
 * репутация и события.
 */
function makeSettlement(planet, systemSeed, index, id){
  if(planet.type === "gas") return null;
  const rng=mulberry32(hash2i(index,planet.seed,systemSeed));
  const byType={
    terran:"agri",ocean:"agri",jungle:"agri",
    desert:"mining",mars:"mining",moon:"mining",ice:"mining",titan:"mining",methane:"mining",
    lava:"industrial",venus:"industrial",megacity:rng()<.5?"industrial":"military",alien:"science"
  };
  const specialization=byType[planet.type]||"industrial";
  const roll=rng();
  /* Events are generated from the same seed as the settlement. They are
     small, local price nudges for the first market slice; later stages can
     replace this baseline with saved, world-changing events. */
  const event=roll<.09 ? {id:"harvest",priceModifiers:{food:.76,water:.84,luxury:.88}}
    : roll<.17 ? {id:"shortage",priceModifiers:{food:1.28,water:1.2,medicine:1.16}}
    : roll<.23 ? {id:"industrial-boom",priceModifiers:{ore:1.22,components:1.18,electronics:1.12}}
    : null;
  const authority=authorityFor(rng,specialization);
  const settlement={
    id:planet.id, settlement:true, specialization,
    /* Нормированные характеристики: они не претендуют на реалистичные
       абсолютные числа, но дают экономике объяснимые, стабильные различия. */
    population:Number((.15+rng()*.8).toFixed(2)), techLevel:1+Math.floor(rng()*4),
    security:Number((.2+rng()*.75).toFixed(2)), event,
    ...authority
  };
  /* Stations are a deterministic capability map of this settlement. Their
     mutable effects live in the economy save, not in generated system data. */
  settlement.stations=stationsForSettlement(settlement,{systemId:id,planetIndex:index});
  return settlement;
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
    return { id:systemId(galaxy.def.seed,galaxy.systemSeedOf(gs)),bhOnly:true, jets: gs.kind === "qso", jetAng: gs.jetAng || 1.2,
             bh, sstars, star: gs, name: gs.name, planets: [], comets: [], belt: null };
  }
  const seed = galaxy.systemSeedOf(gs);
  const id = systemId(galaxy.def.seed,seed);
  const rng = mulberry32(seed);
  const nPlanets = Math.floor(rng()*PLANETS_MAX);
  const hasBelt = rng() < BELT_CHANCE;
  const cls = CLS[gs.ci];
  const surfaceLum={O:30,B:12,A:3,F:1.5,G:1,K:.45,M:.12,L:.03};
  const sun = { temp: Math.round(cls.temp*(0.9 + rng()*0.2)), seed: seed ^ 0xa, D:0, rot:0,
    lum:surfaceLum[cls.c] || 1 };
  sun.D = sun.temp < 2500 ? 24 : starDiam(sun.temp);
  bakeStar(sun);
  const planets = [];
  const R0 = sun.D/2 + ORBIT_MIN_PAD;
  const step = nPlanets > 0 ? (SYSTEM_SPAN - R0)/nPlanets : 0;
  for(let i=0;i<nPlanets;i++){
    const dist = Math.round(R0 + step*i + rng()*step*0.4);
    const zt = zoneTypes(dist);
    const type = zt[Math.floor(rng()*zt.length)];
    const gas = type === "gas";
    const p = {
      id:planetId(id,i),
      type, seed: Math.floor(rng()*99999),
      size: gas
        ? GAS_SIZE_BASE + 2*Math.floor(rng()*GAS_SIZE_VAR)
        : ROCKY_SIZE_BASE + 2*Math.floor(rng()*ROCKY_SIZE_VAR),
      dist,
      rings: gas && rng() < GAS_RINGS_CHANCE,
      clouds: (type === "terran" || type === "ocean" || gas) && rng() < CLOUDS_CHANCE,
      moons: gas
        ? MOONS_GAS_MIN + Math.floor(rng()*MOONS_GAS_VAR)
        : Math.floor(rng()*MOONS_ROCKY_VAR),
      ang: rng()*Math.PI*2
    };
    p.surface=makeSurfaceProfile(p,sun,seed);
    bakePlanet(p);
    genMoons(p, rng,sun,seed);
    p.moonList.forEach((moon,moonIndex)=>{moon.id=moonId(id,i,moonIndex);});
    p.settlement=makeSettlement(p,seed,i,id);
    planets.push(p);
  }
  let belt = null;
  if (hasBelt){
    const rB = BELT_R_MIN + rng()*(BELT_R_MAX - BELT_R_MIN);
    const width = BELT_W_BASE + rng()*BELT_W_VAR;
    const rocks = [];
    const n = BELT_N_BASE + Math.floor(rng()*BELT_N_VAR);
    const COLS = ["#8d8798","#6b6675","#7a6a55","#57525f","#4a4652"];
    for(let i=0;i<n;i++){
      const dist = rB + (rng()+rng()-1)*width;
    const resources=["ore_fe","ore_cu","ore_ni","ore_ti","ore_al","ore_co","ore_zn","min_quartz","min_silicate","min_lithium","min_rare","ice_h2o","cargo_water","gas_ch4"];
      rocks.push({ dist, ang: rng()*Math.PI*2,
        w: 200/Math.pow(dist,1.5)*(0.9+rng()*0.2),
        s: rng()<0.2?2:1, c: COLS[Math.floor(rng()*COLS.length)],
        num: 100 + Math.floor(rng()*8900), rseed: Math.floor(rng()*99999),
        deposit:{resourceId:resources[Math.floor(rng()*resources.length)],remaining:4+Math.floor(rng()*18),richness:.6+rng()*.8} });
    }
    belt = { rocks };
  }
  const comets = [];
  const nc = rng() < COMET_CHANCE ? 1 : (rng() < 0.5 ? 2 : 0);
  for(let i=0;i<nc;i++){
    comets.push({ a: COMET_A_BASE + rng()*COMET_A_VAR,
      e: COMET_E_BASE + rng()*COMET_E_VAR,
      om: rng()*Math.PI*2, th: rng()*Math.PI*2, ph: rng()*10,
      dir: rng()<0.5?1:-1, r:100, x:0, y:0,
      id: 1000 + Math.floor(rng()*9000) });
  }
  let neb = null;
  if (rng() < NEBULA_CHANCE){
    neb = { hue: Math.floor(rng()*5), dens: 0.8 + rng()*0.6,
            scale: 0.8 + rng()*0.8, seed: Math.floor(rng()*1e9) };
  }
  const S = { id, star: gs, sun, planets, belt, comets, neb,
              name: gs.name || galaxy.fieldName(gs) };
  /* спутники обязаны помещаться в сферу влияния своей планеты */
  fitMoonOrbits(S);
  return S;
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
  S.sun.rot += SPIN_SCALE*dt;
  for(const p of S.planets){
    /* тела движутся по тем же кеплеровым законам, что и корабль:
     * ω = sqrt(μ/r³) — иначе орбитальная механика рассогласуется */
    p.ang += orbitRate(MU_SUN, p.dist)*dt;
    p.rot += p.spin*dt*SPIN_SCALE;
    p.crot += p.spin*dt*SPIN_SCALE*1.4;
    p._x = Math.cos(p.ang)*p.dist;
    p._y = Math.sin(p.ang)*p.dist;
    const muP = muOf("planet", p);
    for(const m of p.moonList){
      m.ang += Math.sign(m.w || 1)*orbitRate(muP, m.orbR)*dt;
      m._x = p._x + Math.cos(m.ang)*m.orbR;
      m._y = p._y + Math.sin(m.ang)*m.orbR;
    }
  }
  if (S.belt) for(const r of S.belt.rocks) r.ang += orbitRate(MU_SUN, r.dist)*dt;
  for(const c of S.comets){
    /* угловая скорость из момента импульса: dθ/dt = h/r² */
    const h = Math.sqrt(MU_SUN*c.a*(1 - c.e*c.e));
    c.r = c.a*(1 - c.e*c.e)/(1 + c.e*Math.cos(c.th));
    c.th += c.dir*(h/(c.r*c.r))*dt;
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
