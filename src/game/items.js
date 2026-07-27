import { ComputerMemory } from "./computer.js";

/** Абстракция предмета.
 *
 *  Всё, что можно нести, установить или выбросить, — это Item.
 *  Модули занимают слот корабля (корпус, двигатель, бак, захват),
 *  груз слота не занимает и просто лежит в трюме.
 *
 *  Класс (1–8) и рейтинг (A–E) — как в Elite: класс задаёт габарит,
 *  рейтинг — качество. Отображаются вместе: «3A», «2C». */

export const SLOTS = [
  { id:"hull",   name:"Корпус",       icon:"◧" },
  { id:"engine", name:"Двигатель",    icon:"▲" },
  { id:"tank",   name:"Топливный бак",icon:"▮" },
  { id:"scoop",  name:"Захват",       icon:"◇" },
  { id:"computer", name:"Борт. компьютер", icon:"◈" }
];
export const SLOT_RU = Object.fromEntries(SLOTS.map(s => [s.id, s.name]));

export const RATING_ORDER = ["E","D","C","B","A"];

/** Каталог модулей и груза. */
export const CATALOG = [
  /* ---------- корпуса ---------- */
  { id:"hull_scout", slot:"hull", cls:2, rating:"D", name:"Разведчик «Игла»",
    mass:3.2, price:180000, stats:{ cargo:6,  crew:1, hullInt:180 } },
  { id:"hull_std",   slot:"hull", cls:4, rating:"C", name:"Универсал «Веста»",
    mass:5.0, price:640000, stats:{ cargo:16, crew:2, hullInt:340 } },
  { id:"hull_hauler",slot:"hull", cls:6, rating:"C", name:"Грузовик «Тяга»",
    mass:9.4, price:1850000, stats:{ cargo:48, crew:3, hullInt:520 } },

  /* ---------- двигатели ---------- */
  { id:"eng_ion",   slot:"engine", cls:2, rating:"A", name:"Ионный «Тень»",
    mass:0.9, price:420000, stats:{ thrust:18,  isp:3800 } },
  { id:"eng_lite",  slot:"engine", cls:2, rating:"D", name:"Маневровый LT-3",
    mass:0.6, price:75000,  stats:{ thrust:120, isp:340 } },
  { id:"eng_main",  slot:"engine", cls:4, rating:"C", name:"Основной M-7",
    mass:1.4, price:260000, stats:{ thrust:240, isp:380 } },
  { id:"eng_heavy", slot:"engine", cls:6, rating:"B", name:"Тяжёлый «Овен»",
    mass:3.2, price:910000, stats:{ thrust:680, isp:310 } },
  { id:"eng_nuke",  slot:"engine", cls:5, rating:"A", name:"Ядерный NERV-2",
    mass:2.8, price:1450000,stats:{ thrust:160, isp:850 } },

  /* ---------- баки ---------- */
  { id:"tank_s", slot:"tank", cls:2, rating:"E", name:"Бак малый",
    mass:0.9, price:24000,  stats:{ cap:8  } },
  { id:"tank_m", slot:"tank", cls:4, rating:"D", name:"Бак средний",
    mass:2.0, price:88000,  stats:{ cap:22 } },
  { id:"tank_l", slot:"tank", cls:6, rating:"C", name:"Бак большой",
    mass:4.2, price:265000, stats:{ cap:52 } },

  /* ---------- захваты ----------
     scoopRate — сбор топлива у звезды, т/с
     grabRange — дальность подбора груза, du
     grabSpeed — предельная относительная скорость подбора, du/с
     scoopAlt  — рабочая высота над фотосферой, в радиусах звезды      */
  { id:"scoop_basic", slot:"scoop", cls:1, rating:"E", name:"Манипулятор «Клешня»",
    mass:0.4, price:32000, stats:{ scoopRate:0,     grabRange:6,  grabSpeed:0.02, scoopAlt:0 } },
  { id:"scoop_fuel",  slot:"scoop", cls:3, rating:"C", name:"Топливозаборник FS-2",
    mass:1.1, price:190000,stats:{ scoopRate:0.055, grabRange:8,  grabSpeed:0.03, scoopAlt:0.85 } },
  { id:"scoop_pro",   slot:"scoop", cls:5, rating:"A", name:"Заборник «Протуберанец»",
    mass:2.3, price:820000,stats:{ scoopRate:0.19,  grabRange:14, grabSpeed:0.05, scoopAlt:1.6 } },

  /* ---------- груз ---------- */
  { id:"ore_fe",   slot:"cargo", cls:1, rating:"E", name:"Железная руда",     mass:1, price:320 },
  { id:"ore_ti",   slot:"cargo", cls:1, rating:"C", name:"Титановая руда",    mass:1, price:1450 },
  { id:"ore_pt",   slot:"cargo", cls:1, rating:"A", name:"Платиновый концентрат", mass:1, price:9800 },
  { id:"ice_h2o",  slot:"cargo", cls:1, rating:"E", name:"Водяной лёд",       mass:1, price:180 },
  { id:"he3",      slot:"cargo", cls:1, rating:"B", name:"Гелий-3",           mass:1, price:5400 },
  { id:"salvage",  slot:"cargo", cls:1, rating:"D", name:"Обломки конструкций", mass:1, price:760 },
  { id:"probe",    slot:"cargo", cls:2, rating:"C", name:"Исследовательский зонд", mass:2, price:24000 },

  /* ---------- бортовые компьютеры ---------- */
  { id:"comp_basic", slot:"computer", cls:3, rating:"C", name:"МК-1 «Пролог»",
    mass:1.8, price:450000, stats:{ ramKb:32 } },
  { id:"comp_adv",   slot:"computer", cls:5, rating:"A", name:"МК-2П «Алгол»",
    mass:2.4, price:1200000, stats:{ ramKb:128 } }
];

export const byId = id => CATALOG.find(d => d.id === id) || null;
export const bySlot = slot => CATALOG.filter(d => d.slot === slot);

/** Экземпляр предмета: определение + количество. */
export class Item {
  constructor(defId, qty = 1){
    this.def = byId(defId);
    this.qty = qty;
    if (this.slot === "computer"){
      this.memory = new ComputerMemory(this.stats.ramKb || 32);
    }
  }
  get id(){ return this.def.id; }
  get slot(){ return this.def.slot; }
  get name(){ return this.def.name; }
  get mass(){ return this.def.mass*this.qty; }
  get tag(){ return this.def.cls + this.def.rating; }
  get stats(){ return this.def.stats || {}; }
  clone(qty){ return new Item(this.def.id, qty ?? this.qty); }
}
export const makeItem = (id, qty = 1) => new Item(id, qty);

/** Человекочитаемые характеристики предмета для панели. */
export function itemStatLines(def){
  const s = def.stats || {};
  const out = [];
  if (def.slot === "computer"){
    out.push("память " + s.ramKb + " КБ");
  } else if (def.slot === "hull"){
    out.push("трюм " + s.cargo + " т", "экипаж " + s.crew, "прочность " + s.hullInt);
  } else if (def.slot === "engine"){
    out.push("тяга " + s.thrust + " кН", "Iₛₚ " + s.isp + " с");
  } else if (def.slot === "tank"){
    out.push("ёмкость " + s.cap + " т");
  } else if (def.slot === "scoop"){
    out.push("подбор " + s.grabRange + " du");
    if (s.scoopRate > 0) out.push("сбор " + (s.scoopRate*60).toFixed(1) + " т/мин",
                                  "высота ×" + s.scoopAlt + " R");
    else out.push("сбор топлива: нет");
  }
  out.push("масса " + def.mass + " т");
  return out;
}
