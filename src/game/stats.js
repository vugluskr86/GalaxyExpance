import { mulberry32 } from "../core/rng.js";
import { PT_RU } from "../gen/planet.js";

/** Физико-химические характеристики планеты/луны — детерминированно из зерна,
 *  инсоляции (светимость звезды / расстояние) и типа мира. */
export function planetStats(S, p, kind, parentDist){
  if (p._stats) return p._stats;
  if(p.surface){
    const q=p.surface,parts=[];
    for(const [name,value] of [["N₂",q.gN2],["O₂",q.gO2],["CO₂",q.gCO2],["CH₄",q.gCH4],["SO₂",q.gSO2],["H₂O",q.gH2O]])if(value>.01)parts.push(`${name} ${Math.round(value*100)} %`);
    const liquid={water:"вода (океаны и озёра)",methane:"жидкий метан (озёра)",ammonia:"аммиачный раствор",lava:"расплавленная порода",none:"нет"}[q.liquidType]||"нет";
    const veg=q.vegetation>.5?"леса и травы":q.vegetation>.16?"разреженная растительность":q.vegetation>.04?"мхи и лишайники":"нет";
    p._stats={tempC:Math.round(q.tempK-273),atm:q.pressure<.02?"нет (следовые газы)":(parts.join(" · ")||"плотная атмосфера"),pressure:q.pressure<.01?"< 0.001 атм":q.pressure.toFixed(2)+" атм",liquid,minerals:q.minerals>.7?"богатые залежи":q.minerals>.35?"железо, никель, силикаты":"бедные силикаты",veg,grav:q.gravity.toFixed(2),day:Math.round((2*Math.PI/(Math.max(.05,p.spin)*2.6e-4))/360)/10,typeRu:PT_RU[p.type],hasAtm:q.pressure>=.02};
    return p._stats;
  }
  const rng = mulberry32(p.seed ^ 0x57a7);
  const dist = kind === "moon" ? parentDist : p.dist;
  const L = Math.pow(S.sun.D/37.7, 2)*Math.pow(S.sun.temp/5700, 4);
  const flux = L/Math.pow(Math.max(30, dist)/100, 2);
  const baseK = 278*Math.pow(flux, 0.25);

  const CFG = {
    terran:{ alb:0.95, gh:32,  pr:[0.6,1.6] },
    ocean: { alb:0.92, gh:46,  pr:[0.8,2.5] },
    desert:{ alb:1.00, gh:12,  pr:[0.01,0.15] },
    ice:   { alb:0.80, gh:5,   pr:[0.0,0.3] },
    lava:  { alb:1.05, gh:420, pr:[0.5,60] },
    gas:   { alb:0.85, gh:-150,pr:null },
    alien: { alb:0.90, gh:27,  pr:[0.4,2.2] },
    moon:  { alb:1.00, gh:0,   pr:[0.0,0.01] }
  };
  const c = CFG[p.type] || CFG.moon;
  const tempC = Math.round(baseK*c.alb + c.gh - 273 + (rng()-0.5)*14);

  let atm, pressure;
  if (p.type === "gas"){
    atm = rng() < 0.5 ? "H₂ 90 % · He 9 % · CH₄" : "H₂ 88 % · He 10 % · NH₃";
    pressure = "→ ∞ (газовый гигант)";
  } else if (c.pr[1] < 0.02){
    atm = "нет (следовые газы)";
    pressure = "< 0.001 атм";
  } else {
    const prV = c.pr[0] + rng()*(c.pr[1]-c.pr[0]);
    pressure = (prV < 0.1 ? prV.toFixed(3) : prV.toFixed(2)) + " атм";
    const ATMS = {
      terran:["N₂ 77 % · O₂ 21 % · Ar","N₂ 80 % · O₂ 18 % · CO₂"],
      ocean: ["N₂ 70 % · O₂ 24 % · H₂O","N₂ 65 % · O₂ 28 % · H₂O"],
      desert:["CO₂ 95 % · N₂ 3 % · Ar","CO₂ 90 % · N₂ 7 %"],
      ice:   ["N₂ 92 % · CH₄ 6 %","N₂ 85 % · CO 10 %"],
      lava:  ["SO₂ 40 % · CO₂ 35 % · пары пород","CO₂ 60 % · SO₂ 25 %"],
      alien: ["N₂ 60 % · CH₄ 25 % · O₃","N₂ 55 % · CH₄ 30 % · NH₃"]
    };
    const list = ATMS[p.type] || ["N₂ · следы"];
    atm = list[Math.floor(rng()*list.length)];
  }

  let liquid = "нет";
  if (p.type === "ocean") liquid = "вода (глобальный океан)";
  else if (p.type === "terran") liquid = tempC > -10 && tempC < 60 ? "вода (океаны и озёра)" : "лёд, подповерхностная вода";
  else if (p.type === "ice") liquid = tempC < -140 ? "жидкий метан/этан (озёра)" : "подповерхностная вода";
  else if (p.type === "lava") liquid = "расплавленная порода";
  else if (p.type === "alien") liquid = rng() < 0.5 ? "вода с примесями" : "аммиачный раствор";
  else if (p.type === "gas") liquid = "металлический водород (недра)";

  let minerals;
  if (p.type === "gas") minerals = "гелий-3 (верхняя атмосфера)";
  else if (p.type === "ice"){
    const pool = ["водяной лёд","аммиачный лёд","силикаты","клатраты метана"];
    minerals = pool.filter(() => rng() < 0.6).join(", ") || "водяной лёд";
  } else {
    const pool = ["железо","никель","титан","медь","алюминий","редкоземельные","уран","золото","кремний"];
    const rich = rng();
    const picked = pool.filter(() => rng() < (0.25 + rich*0.3)).slice(0, 4);
    minerals = (picked.length ? picked.join(", ") : "силикаты") +
      (rich > 0.75 ? " · богатые залежи" : (rich < 0.25 ? " · бедные" : ""));
  }

  let veg = "нет";
  const hasO2 = atm.includes("O₂");
  if (p.type === "terran" && hasO2 && tempC > -15 && tempC < 45)
    veg = ["леса и травы","степная растительность","мхи и лишайники"][Math.floor(rng()*3)];
  else if (p.type === "ocean" && tempC > -5 && tempC < 50)
    veg = "водоросли и фитопланктон";
  else if (p.type === "alien")
    veg = "хемосинтетическая (пурпурная)";

  const grav = (p.size/24).toFixed(2);
  const day = Math.round((2*Math.PI/(Math.max(0.05, p.spin)*2.6e-4))/360)/10;

  p._stats = { tempC, atm, pressure, liquid, minerals, veg, grav, day,
               typeRu: PT_RU[p.type], hasAtm: !(atm.startsWith("нет")) };
  return p._stats;
}

/** Характеристики малых тел: ядро кометы, обломок пояса. */
export function smallBodyStats(S, kind, body, dist){
  if (body._stats) return body._stats;
  const seedv = (body.rseed ?? ((body.id || 1)*77)) | 0;
  const rng = mulberry32(seedv ^ 0x57a7);
  const L = Math.pow(S.sun.D/37.7, 2)*Math.pow(S.sun.temp/5700, 4);
  const flux = L/Math.pow(Math.max(30, dist)/100, 2);
  const tempC = Math.round(278*Math.pow(flux, 0.25) - 273 + (rng()-0.5)*10);
  let minerals, liquid, atm;
  if (kind === "comet"){
    minerals = "водяной и CO₂-льды, силикатная пыль" + (rng() < 0.4 ? ", клатраты CO" : "");
    liquid = tempC > -60 ? "льды сублимируют (кома)" : "льды стабильны";
    atm = "нет (газы комы)";
  } else {
    const pool = ["железо","никель","силикаты","углистые хондриты","платина","водяной лёд"];
    const picked = pool.filter(() => rng() < 0.45).slice(0, 3);
    minerals = (picked.length ? picked.join(", ") : "силикаты") + (rng() > 0.8 ? " · богатая руда" : "");
    liquid = "нет";
    atm = "нет";
  }
  body._stats = {
    tempC, atm, pressure: "< 0.001 атм", liquid, minerals, veg: "нет",
    grav: "< 0.01", day: Math.round(5 + rng()*20),
    typeRu: kind === "comet" ? "ядро кометы" : "астероид", hasAtm: false
  };
  return body._stats;
}

/** Карточка звезды для тултипа. */
export function starTooltipHTML(name, cls, D){
  const KIND = { O:"голубой сверхгигант", B:"бело-голубая звезда", A:"белая звезда",
    F:"жёлто-белая звезда", G:"жёлтый карлик", K:"оранжевый карлик",
    M:"красный карлик", L:"коричневый карлик" };
  return `<b>${name}</b><br>спектральный класс ${cls.c} · ${KIND[cls.c] || "звезда"}<br>` +
    `фотосфера: ≈${cls.temp.toLocaleString("ru-RU")} K<br>Ø ${D} px · посадка невозможна`;
}

export function statsTooltipHTML(name, st){
  return `<b>${name}</b><br>` +
    `${st.typeRu} · сутки ${st.day} ч · ${st.grav} g<br>` +
    `T ср: ${st.tempC > 0 ? "+" : ""}${st.tempC} °C · давление: ${st.pressure}<br>` +
    `атмосфера: ${st.atm}<br>` +
    `жидкость: ${st.liquid}<br>` +
    `недра: ${st.minerals}<br>` +
    `растительность: ${st.veg}`;
}
