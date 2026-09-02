import { ComputerFirmware, ComputerMemory } from "./computer.js";
import { ComputerRuntime } from "./cpu.js";
import { INSTALLER_BINARY, INSTALL_PCFD_BASE64 } from "./install-media.generated.js";
import { SCANNER_BIN } from "./scanner-generated.js";
import { InodeFS } from "./vfs.js";
import { INODE_TYPES } from "./protected-mode.js";

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
  { id:"shield", name:"Генератор щита", icon:"◌" },
  { id:"droid",  name:"Ремонтные дроиды", icon:"✚" },
  { id:"reactor",name:"Реактор",      icon:"⚛" },
  { id:"weapon1",name:"Оружие 1", icon:"✦", itemSlot:"weapon" },
  { id:"weapon2",name:"Оружие 2", icon:"✦", itemSlot:"weapon" },
  { id:"weapon3",name:"Оружие 3", icon:"✦", itemSlot:"weapon" },
  { id:"weapon4",name:"Оружие 4", icon:"✦", itemSlot:"weapon" },
  { id:"weapon5",name:"Оружие 5", icon:"✦", itemSlot:"weapon" },
  { id:"computer1", name:"Компьютер 1", icon:"◈", itemSlot:"computer" },
  { id:"computer2", name:"Компьютер 2", icon:"◈", itemSlot:"computer" },
  { id:"computer3", name:"Компьютер 3", icon:"◈", itemSlot:"computer" },
  { id:"computer4", name:"Компьютер 4", icon:"◈", itemSlot:"computer" },
  { id:"computer5", name:"Компьютер 5", icon:"◈", itemSlot:"computer" },
  { id:"terminal1", name:"Терминал 1", icon:"▣", itemSlot:"terminal" },
  { id:"terminal2", name:"Терминал 2", icon:"▣", itemSlot:"terminal" },
  { id:"terminal3", name:"Терминал 3", icon:"▣", itemSlot:"terminal" },
  { id:"terminal4", name:"Терминал 4", icon:"▣", itemSlot:"terminal" },
  { id:"terminal5", name:"Терминал 5", icon:"▣", itemSlot:"terminal" },
  { id:"antenna", name:"Антенна", icon:"⌁" },
  { id:"scanner", name:"Сканер", icon:"◉" }
  ,{ id:"hyperdrive", name:"Гипердвигатель", icon:"✦" }
  ,{ id:"capacitor", name:"Конденсатор", icon:"▤" }
  ,{ id:"mining", name:"Добывающий модуль", icon:"⛏" }
  ,{ id:"gyro", name:"Гироскоп", icon:"↻" }
];
export const COMPUTER_SLOTS = [
  { id:"gpu", name:"GPU", icon:"▦" },
  { id:"cpu", name:"CPU", icon:"◆" },
  { id:"ram", name:"RAM", icon:"▥" },
  { id:"drive", name:"DRIVE", icon:"▤" },
  { id:"peripheral1", name:"Периферия 1", icon:"○" },
  { id:"peripheral2", name:"Периферия 2", icon:"○" },
  { id:"peripheral3", name:"Периферия 3", icon:"○" }
];
export const EXPANSION_COMPUTER_SLOTS = [
  ...COMPUTER_SLOTS,
  { id:"peripheral4", name:"Периферия 4", icon:"○" }
];
export const SLOT_RU = Object.fromEntries([...SLOTS, ...COMPUTER_SLOTS].map(s => [s.id, s.name]));
export const itemSlotFor = slotId => SLOTS.find(slot=>slot.id===slotId)?.itemSlot || slotId;

export const RATING_ORDER = ["E","D","C","B","A"];
let nextItemInstanceId=1;
export const ensureItemInstanceId=item=>{
  if(item&&!item.instanceId)item.instanceId=`item-${nextItemInstanceId++}`;
  return item?.instanceId;
};

/** Каталог модулей и груза. */
export const CATALOG = [
  /* ---------- корпуса ---------- */
  { id:"hull_scout", slot:"hull", cls:2, rating:"D", name:"Разведчик «Игла»", mass:3.2, price:180000, stats:{ cargo:6,crew:1,hullInt:180,weaponSlots:1,droidSlot:false,computerSlots:0,terminalSlots:0,antennaSlot:true,scannerSlot:true,hyperdriveSlot:false,capacitorSlot:true,miningSlot:false,maxTakeoffMass:15,hullSprite:"scout" } },
  { id:"hull_std", slot:"hull", cls:4, rating:"C", name:"Универсал «Веста»", mass:5, price:640000, stats:{ cargo:16,crew:2,hullInt:340,weaponSlots:2,computerSlots:1,terminalSlots:1,antennaSlot:true,scannerSlot:true,maxTakeoffMass:65,hullSprite:"vesta" } },
  { id:"hull_hauler", slot:"hull", cls:6, rating:"C", name:"Грузовик «Тяга»", mass:9.4, price:1850000, stats:{ cargo:48,crew:3,hullInt:520,weaponSlots:2,scoopSlot:false,computerSlots:2,terminalSlots:1,antennaSlot:true,scannerSlot:true,maxTakeoffMass:95,hullSprite:"hauler" } },
  { id:"hull_courier", slot:"hull", cls:2, rating:"B", name:"Курьер «Стриж»", mass:2.8, price:310000, stats:{ cargo:4,crew:1,hullInt:150,weaponSlots:1,shieldSlot:false,computerSlots:1,terminalSlots:0,antennaSlot:true,scannerSlot:false,hyperdriveSlot:false,capacitorSlot:true,miningSlot:false,maxTakeoffMass:14,hullSprite:"courier" } },
  { id:"hull_interceptor", slot:"hull", cls:3, rating:"A", name:"Перехватчик «Зенит»", mass:3.9, price:820000, stats:{ cargo:5,crew:1,hullInt:230,weaponSlots:3,computerSlots:1,terminalSlots:1,antennaSlot:true,scannerSlot:true,maxTakeoffMass:23,hullSprite:"interceptor" } },
  { id:"hull_miner", slot:"hull", cls:4, rating:"C", name:"Рудокоп «Ковш»", mass:6.2, price:990000, stats:{ cargo:30,crew:2,hullInt:370,weaponSlots:2,shieldSlot:false,computerSlots:2,terminalSlots:1,antennaSlot:true,scannerSlot:true,maxTakeoffMass:62,hullSprite:"miner" } },
  { id:"hull_explorer", slot:"hull", cls:4, rating:"B", name:"Эксплорер «Полярис»", mass:5.6, price:1150000, stats:{ cargo:20,crew:3,hullInt:320,weaponSlots:2,droidSlot:false,computerSlots:2,terminalSlots:2,antennaSlot:true,scannerSlot:true,maxTakeoffMass:48,hullSprite:"explorer" } },
  { id:"hull_gunship", slot:"hull", cls:5, rating:"B", name:"Канонерка «Гром»", mass:7.3, price:1680000, stats:{ cargo:10,crew:3,hullInt:560,weaponSlots:4,computerSlots:2,terminalSlots:2,antennaSlot:true,scannerSlot:true,maxTakeoffMass:45,hullSprite:"gunship" } },
  { id:"hull_corvette", slot:"hull", cls:5, rating:"A", name:"Корвет «Ладога»", mass:8.1, price:2100000, stats:{ cargo:18,crew:4,hullInt:610,weaponSlots:3,shieldSlot:false,computerSlots:2,terminalSlots:2,antennaSlot:true,scannerSlot:true,maxTakeoffMass:58,hullSprite:"corvette" } },
  { id:"hull_frigate", slot:"hull", cls:6, rating:"B", name:"Фрегат «Меридиан»", mass:11.2, price:3300000, stats:{ cargo:26,crew:6,hullInt:820,weaponSlots:5,computerSlots:3,terminalSlots:3,antennaSlot:true,scannerSlot:true,maxTakeoffMass:82,hullSprite:"frigate" } },
  { id:"hull_freighter", slot:"hull", cls:6, rating:"C", name:"Транспорт «Атлант»", mass:12.8, price:2700000, stats:{ cargo:72,crew:5,hullInt:700,weaponSlots:2,computerSlots:3,terminalSlots:2,antennaSlot:true,scannerSlot:true,maxTakeoffMass:145,hullSprite:"freighter" } },
  { id:"hull_carrier", slot:"hull", cls:7, rating:"A", name:"Носитель «Орбита»", mass:16.5, price:5900000, stats:{ cargo:54,crew:12,hullInt:1100,weaponSlots:4,computerSlots:5,terminalSlots:5,antennaSlot:true,scannerSlot:true,maxTakeoffMass:150,hullSprite:"carrier" } },
  { id:"hull_dreadnought", slot:"hull", cls:8, rating:"A", name:"Дредноут «Бастион»", mass:24, price:9800000, stats:{ cargo:38,crew:18,hullInt:1600,weaponSlots:5,computerSlots:12,terminalSlots:5,antennaSlot:true,scannerSlot:true,maxTakeoffMass:220,hullSprite:"dreadnought" } },

  /* ---------- двигатели ---------- */
  { id:"eng_ion",   slot:"engine", cls:2, rating:"A", name:"Ионный «Тень»",
    mass:0.9, price:420000, stats:{ thrust:18,  isp:3800, maxLiftMass:18 } },
  { id:"eng_lite",  slot:"engine", cls:2, rating:"D", name:"Маневровый LT-3",
    mass:0.6, price:75000,  stats:{ thrust:120, isp:340, maxLiftMass:24 } },
  { id:"eng_main",  slot:"engine", cls:4, rating:"C", name:"Основной M-7",
    mass:1.4, price:260000, stats:{ thrust:240, isp:380, maxLiftMass:65 } },
  { id:"eng_heavy", slot:"engine", cls:6, rating:"B", name:"Тяжёлый «Овен»",
    mass:3.2, price:910000, stats:{ thrust:680, isp:310, maxLiftMass:110 } },
  { id:"eng_nuke",  slot:"engine", cls:5, rating:"A", name:"Ядерный NERV-2",
    mass:2.8, price:1450000,stats:{ thrust:160, isp:850, maxLiftMass:72 } },

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

  /* ---------- реакторы, щиты и ремонт ---------- */
  { id:"reactor_mk1", slot:"reactor", cls:1, rating:"D", name:"Реактор Р-1 «Искра»", mass:0.8, price:120000, stats:{ grade:1,power:40 } },
  { id:"reactor_mk2", slot:"reactor", cls:2, rating:"C", name:"Реактор Р-2 «Пульс»", mass:1.3, price:280000, stats:{ grade:2,power:80 } },
  { id:"reactor_mk3", slot:"reactor", cls:3, rating:"B", name:"Реактор Р-3 «Спектр»", mass:2.1, price:610000, stats:{ grade:3,power:150 } },
  { id:"reactor_mk4", slot:"reactor", cls:4, rating:"A", name:"Реактор Р-4 «Гелиос»", mass:3.4, price:1350000, stats:{ grade:4,power:280 } },
  { id:"cap_s", slot:"capacitor", cls:1, rating:"D", name:"Конденсатор К-20", mass:.5, price:85000, stats:{ capacity:20,chargeRate:4,maxOutput:25 } },
  { id:"cap_m", slot:"capacitor", cls:3, rating:"B", name:"Конденсатор К-90 «Импульс»", mass:1.2, price:340000, stats:{ capacity:90,chargeRate:12,maxOutput:100 } },
  { id:"cap_l", slot:"capacitor", cls:5, rating:"A", name:"Конденсатор К-260 «Шторм»", mass:2.7, price:950000, stats:{ capacity:260,chargeRate:28,maxOutput:280 } },
  { id:"hyper_s", slot:"hyperdrive", cls:2, rating:"D", name:"Гипердвигатель ГД-1 «Скачок»", mass:1.4, price:520000, stats:{ range:140,prepare:3,energy:18,antimatter:.12 } },
  { id:"hyper_m", slot:"hyperdrive", cls:4, rating:"B", name:"Гипердвигатель ГД-4 «Трасса»", mass:2.8, price:1600000, stats:{ range:420,prepare:6,energy:55,antimatter:.28 } },
  { id:"hyper_l", slot:"hyperdrive", cls:6, rating:"A", name:"Гипердвигатель ГД-8 «Горизонт»", mass:5.1, price:4200000, stats:{ range:950,prepare:10,energy:145,antimatter:.65 } },
  { id:"miner_basic", slot:"mining", cls:2, rating:"D", name:"Буровой лазер БЛ-1", mass:.9, price:190000, stats:{ rate:.28,range:9 } },
  { id:"miner_pro", slot:"mining", cls:4, rating:"B", name:"Добывающий комплекс ДК-4", mass:2.1, price:720000, stats:{ rate:.8,range:15 } },
  { id:"shield_s", slot:"shield", cls:1, rating:"D", name:"Щит СГ-20", mass:0.7, price:150000, stats:{ capacity:20,regen:2 } },
  { id:"shield_m", slot:"shield", cls:2, rating:"C", name:"Щит СГ-55", mass:1.3, price:360000, stats:{ capacity:55,regen:4 } },
  { id:"shield_l", slot:"shield", cls:3, rating:"B", name:"Щит СГ-110 «Купол»", mass:2.4, price:820000, stats:{ capacity:110,regen:7 } },
  { id:"shield_x", slot:"shield", cls:4, rating:"A", name:"Щит СГ-190 «Эгида»", mass:4.1, price:1700000, stats:{ capacity:190,regen:11 } },
  { id:"droid_s", slot:"droid", cls:1, rating:"D", name:"Дроиды РД-1", mass:0.4, price:90000, stats:{ repair:1.2 } },
  { id:"droid_m", slot:"droid", cls:2, rating:"C", name:"Дроиды РД-4 «Латка»", mass:0.8, price:240000, stats:{ repair:2.8 } },
  { id:"droid_l", slot:"droid", cls:3, rating:"B", name:"Дроиды РД-8 «Мастер»", mass:1.5, price:590000, stats:{ repair:5.5 } },
  { id:"droid_x", slot:"droid", cls:4, rating:"A", name:"Дроиды РД-16 «Рой»", mass:2.7, price:1250000, stats:{ repair:9 } },

  /* ---------- вооружение ---------- */
  { id:"wpn_laser", slot:"weapon", cls:2, rating:"C", name:"Лазер Л-12 «Искра»", mass:0.7, price:180000, stats:{ weaponType:"laser", damage:14, range:160, speed:760, cooldown:0.16, ammo:0, color:"#ff6bd6" } },
  { id:"wpn_energy", slot:"weapon", cls:3, rating:"B", name:"Энергопушка ЭП-4 «Вольт»", mass:1.2, price:330000, stats:{ weaponType:"energy", damage:28, range:140, speed:430, cooldown:0.48, ammo:0, color:"#8fd0ff" } },
  { id:"wpn_kinetic", slot:"weapon", cls:3, rating:"C", name:"Кинетическая пушка К-90", mass:1.8, price:280000, stats:{ weaponType:"kinetic", damage:42, range:180, speed:310, cooldown:0.65, ammo:90, color:"#ffd166" } },
  { id:"wpn_missile", slot:"weapon", cls:4, rating:"B", name:"ПУ «Стриж» · ракеты", mass:1.6, price:460000, stats:{ weaponType:"missile", damage:68, range:300, speed:115, cooldown:1.1, ammo:12, guided:true, color:"#7ee08a" } },
  { id:"wpn_torpedo", slot:"weapon", cls:5, rating:"B", name:"Торпедный аппарат ТА-6", mass:2.5, price:620000, stats:{ weaponType:"torpedo", damage:125, range:380, speed:78, cooldown:2.1, ammo:6, splash:10, color:"#ff9a6b" } },
  { id:"wpn_emp", slot:"weapon", cls:4, rating:"A", name:"ЭМИ-излучатель «Гроза»", mass:1.4, price:780000, stats:{ weaponType:"emp", damage:4, range:130, speed:170, cooldown:2.6, ammo:8, splash:18, emp:8, color:"#c9a0e8" } },
  { id:"wpn_nuclear", slot:"weapon", cls:6, rating:"A", name:"Ядерная торпеда «Гелиос»", mass:4.8, price:2400000, stats:{ weaponType:"nuclear", damage:420, range:520, speed:66, cooldown:5, ammo:2, splash:34, guided:true, nuclear:true, color:"#f07d1a" } },
  { id:"wpn_mine", slot:"weapon", cls:3, rating:"C", name:"Минный постановщик МП-8", mass:1.1, price:290000, stats:{ weaponType:"mine", damage:96, range:260, speed:4, cooldown:1.3, ammo:16, splash:14, mine:true, color:"#ff5c4d" } },

  /* ---------- груз ---------- */
  /* Торговые товары намеренно являются обычными Item. Благодаря этому трюм,
     выброс за борт и сохранение работают для рынка тем же путём, что и для
     любого другого груза. Цена здесь — лишь справочная; цена сделки живёт в
     economy.js и зависит от конкретного поселения. */
  { id:"cargo_food", slot:"cargo", cls:1, rating:"E", name:"Пищевые пайки", mass:1, price:80 },
  { id:"cargo_water", slot:"cargo", cls:1, rating:"E", name:"Очищенная вода", mass:1, price:45 },
  { id:"cargo_medicine", slot:"cargo", cls:1, rating:"B", name:"Медицинские наборы", mass:1, price:430 },
  { id:"cargo_fuel", slot:"cargo", cls:1, rating:"D", name:"Топливные элементы", mass:1, price:160 },
  { id:"cargo_electronics", slot:"cargo", cls:1, rating:"C", name:"Электроника", mass:1, price:520 },
  { id:"cargo_components", slot:"cargo", cls:1, rating:"C", name:"Промышленные компоненты", mass:1, price:340 },
  { id:"cargo_arms", slot:"cargo", cls:1, rating:"A", name:"Военное снаряжение", mass:1, price:860 },
  { id:"cargo_luxury", slot:"cargo", cls:1, rating:"B", name:"Предметы роскоши", mass:1, price:720 },
  { id:"cargo_data", slot:"cargo", cls:1, rating:"B", name:"Научные данные", mass:0.2, price:680 },
  { id:"cargo_contraband", slot:"cargo", cls:1, rating:"A", name:"Контрабандный груз", mass:1, price:980 },
  { id:"ore_fe",   slot:"cargo", cls:1, rating:"E", name:"Железная руда",     mass:1, price:320 },
  { id:"ore_ti",   slot:"cargo", cls:1, rating:"C", name:"Титановая руда",    mass:1, price:1450 },
  { id:"ore_pt",   slot:"cargo", cls:1, rating:"A", name:"Платиновый концентрат", mass:1, price:9800 },
  { id:"ice_h2o",  slot:"cargo", cls:1, rating:"E", name:"Водяной лёд",       mass:1, price:180 },
  { id:"he3",      slot:"cargo", cls:1, rating:"B", name:"Гелий-3",           mass:1, price:5400 },
  { id:"salvage",  slot:"cargo", cls:1, rating:"D", name:"Обломки конструкций", mass:1, price:760 },
  { id:"antimatter", slot:"cargo", cls:5, rating:"A", name:"Контейнер антиматерии", mass:.1, price:18000 },
  { id:"probe",    slot:"cargo", cls:2, rating:"C", name:"Планетарный зонд", mass:2, price:24000 },
  { id:"probe_space", slot:"cargo", cls:3, rating:"B", name:"Космический зонд", mass:1.4, price:42000 },
  { id:"min_quartz",slot:"cargo",cls:1,rating:"E",name:"Кварц",mass:1,price:140 }, { id:"min_silicate",slot:"cargo",cls:1,rating:"E",name:"Силикаты",mass:1,price:120 },
  { id:"min_sulfur",slot:"cargo",cls:1,rating:"D",name:"Сера",mass:1,price:210 }, { id:"min_phosphate",slot:"cargo",cls:1,rating:"D",name:"Фосфаты",mass:1,price:260 },
  { id:"min_lithium",slot:"cargo",cls:2,rating:"C",name:"Литиевая соль",mass:1,price:920 }, { id:"min_crystal",slot:"cargo",cls:2,rating:"C",name:"Кристаллы",mass:1,price:1100 },
  { id:"min_uranium",slot:"cargo",cls:4,rating:"A",name:"Урановая руда",mass:1,price:6400 }, { id:"min_gem",slot:"cargo",cls:3,rating:"B",name:"Самоцветы",mass:1,price:2800 },
  { id:"min_salt",slot:"cargo",cls:1,rating:"E",name:"Минеральная соль",mass:1,price:90 }, { id:"min_rare",slot:"cargo",cls:4,rating:"A",name:"Редкоземельный концентрат",mass:1,price:7200 },
  { id:"ore_cu",slot:"cargo",cls:2,rating:"D",name:"Медная руда",mass:1,price:560 }, { id:"ore_ni",slot:"cargo",cls:2,rating:"C",name:"Никелевая руда",mass:1,price:780 },
  { id:"ore_al",slot:"cargo",cls:1,rating:"E",name:"Алюминиевая руда",mass:1,price:330 }, { id:"ore_co",slot:"cargo",cls:3,rating:"B",name:"Кобальтовая руда",mass:1,price:1750 },
  { id:"ore_cr",slot:"cargo",cls:2,rating:"C",name:"Хромовая руда",mass:1,price:960 }, { id:"ore_ag",slot:"cargo",cls:3,rating:"B",name:"Серебряная руда",mass:1,price:2300 },
  { id:"ore_zn",slot:"cargo",cls:2,rating:"C",name:"Цинковая руда",mass:1,price:740 },
  { id:"gas_h2",slot:"cargo",cls:1,rating:"E",name:"Водород",mass:1,price:90 }, { id:"gas_o2",slot:"cargo",cls:1,rating:"E",name:"Кислород",mass:1,price:110 },
  { id:"gas_n2",slot:"cargo",cls:1,rating:"E",name:"Азот",mass:1,price:80 }, { id:"gas_ch4",slot:"cargo",cls:2,rating:"D",name:"Метан",mass:1,price:260 },
  { id:"gas_ar",slot:"cargo",cls:2,rating:"C",name:"Аргон",mass:1,price:680 }, { id:"gas_ne",slot:"cargo",cls:3,rating:"B",name:"Неон",mass:1,price:1250 },
  { id:"gas_xe",slot:"cargo",cls:4,rating:"A",name:"Ксенон",mass:1,price:3800 }, { id:"gas_co2",slot:"cargo",cls:1,rating:"E",name:"Углекислый газ",mass:1,price:70 },
  { id:"gas_nh3",slot:"cargo",cls:2,rating:"C",name:"Аммиак",mass:1,price:520 }, { id:"gas_he",slot:"cargo",cls:2,rating:"C",name:"Гелий",mass:1,price:760 },

  /* ---------- бортовые компьютеры ---------- */
  { id:"comp_basic", slot:"computer", cls:3, rating:"C", name:"МК-1 «Пролог»",
    mass:1.4, price:450000, slots: COMPUTER_SLOTS,
    defaults:{ gpu:"gpu_text", cpu:"cpu_single", ram:"ram_8", drive:"drive_magnetic" } },
  { id:"comp_adv",   slot:"computer", cls:5, rating:"A", name:"МК-2П «Алгол»",
    mass:1.7, price:1200000, slots: COMPUTER_SLOTS,
    defaults:{ gpu:"gpu_graphics", cpu:"cpu_quad", ram:"ram_4096", drive:"drive_crystal" } },
  { id:"comp_expand", slot:"computer", cls:6, rating:"A", name:"МК-3М «Магистраль»",
    mass:2.1, price:1650000, slots:EXPANSION_COMPUTER_SLOTS,
    defaults:{ gpu:"gpu_graphics", cpu:"cpu_quad", ram:"ram_4096", peripheral1:"drive_floppy", drive:"drive_hard_big" } },

  /* ---------- терминалы, связь и сенсоры ----------
     Терминал — только экран/клавиатура. Он становится доступен в UI после
     явного соединения с конкретным бортовым компьютером. */
  { id:"term_basic", slot:"terminal", cls:1, rating:"D", name:"Терминал Т-1 «Луч»",
    mass:0.18, price:38000, stats:{ display:"text", ports:1 } },
  { id:"term_graphics", slot:"terminal", cls:3, rating:"B", name:"Терминал Т-3 «Вектор»",
    mass:0.32, price:110000, stats:{ display:"graphics", ports:1 } },
  { id:"antenna_short", slot:"antenna", cls:1, rating:"D", name:"Антенна СВ-8",
    mass:0.12, price:26000, stats:{ range:80, channels:2, signalQuality:.7 } },
  { id:"antenna_mid", slot:"antenna", cls:3, rating:"B", name:"Антенна ДВ-30",
    mass:0.28, price:130000, stats:{ range:300, channels:8, signalQuality:.9 } },
  { id:"antenna_long", slot:"antenna", cls:5, rating:"A", name:"Антенна ДВ-90",
    mass:0.46, price:410000, stats:{ range:900, channels:16, signalQuality:1 } },
  { id:"scanner_basic", slot:"scanner", cls:1, rating:"D", name:"Сканер С-1 «Обзор»",
    mass:.35, price:68000, stats:{ range:100, resolution:1, modes:["passive"] } },
  { id:"scanner_tactical", slot:"scanner", cls:3, rating:"B", name:"Сканер С-3 «Контур»",
    mass:.65, price:220000, stats:{ range:350, resolution:2, modes:["passive","tactical"] } },
  { id:"scanner_deep", slot:"scanner", cls:5, rating:"A", name:"Сканер С-5 «Спектр»",
    mass:1.05, price:620000, stats:{ range:800, resolution:3, modes:["passive","tactical","cargo"] } },

  /* Корабельная сеть. NIC занимает универсальный peripheral-разъём компьютера; коммутаторы — отдельные, не
     редактируемые компьютеры. Их CPU/RAM/прошивка зашиты в stats, а слотов программирования нет. */
  { id:"nic_basic", slot:"peripheral", cls:1, rating:"D", name:"Сетевая карта NIC-100",
    mass:.06, price:42000, stats:{ network:true, ports:1, speed:100, driver:"net-100" } },
  { id:"nic_pro", slot:"peripheral", cls:3, rating:"B", name:"Сетевая карта NIC-1000",
    mass:.09, price:145000, stats:{ network:true, ports:1, speed:1000, driver:"net-1000" } },
  { id:"switch_8", slot:"computer", cls:2, rating:"C", name:"Коммутатор SW-8",
    mass:.7, price:220000, stats:{ networkSwitch:true, ports:8, cpu:"switch-core", ramKb:64, firmware:"swos-1" } },
  { id:"switch_16", slot:"computer", cls:3, rating:"B", name:"Коммутатор SW-16",
    mass:1.0, price:410000, stats:{ networkSwitch:true, ports:16, cpu:"switch-core", ramKb:128, firmware:"swos-1" } },
  { id:"switch_24", slot:"computer", cls:4, rating:"A", name:"Коммутатор SW-24",
    mass:1.35, price:690000, stats:{ networkSwitch:true, ports:24, cpu:"switch-core+", ramKb:256, firmware:"swos-2" } },
  { id:"switch_32", slot:"computer", cls:5, rating:"A", name:"Коммутатор SW-32",
    mass:1.8, price:980000, stats:{ networkSwitch:true, ports:32, cpu:"switch-core+", ramKb:512, firmware:"swos-2" } },
  { id:"gyro_basic", slot:"gyro", cls:2, rating:"C", name:"Гироскоп ГР-2 «Ось»",
    mass:.24, price:78000, stats:{ turnRate:1.2, telemetry:true } },
  { id:"gyro_precise", slot:"gyro", cls:4, rating:"A", name:"Гироскоп ГР-6 «Вектор»",
    mass:.38, price:280000, stats:{ turnRate:2.4, telemetry:true } },

  /* ---------- компоненты компьютера ---------- */
  { id:"gpu_text", slot:"gpu", cls:1, rating:"D", name:"GPU «Литера»",
    mass:0.08, price:18000, stats:{ output:"text" } },
  { id:"gpu_graphics", slot:"gpu", cls:2, rating:"B", name:"GPU «Спектр»",
    mass:0.16, price:92000, stats:{ output:"graphics" } },
  { id:"cpu_single", slot:"cpu", cls:1, rating:"D", name:"CPU «Такт-1»",
    mass:0.05, price:24000, stats:{ threads:1 } },
  { id:"cpu_dual", slot:"cpu", cls:2, rating:"C", name:"CPU «Такт-2»",
    mass:0.08, price:68000, stats:{ threads:2 } },
  { id:"cpu_quad", slot:"cpu", cls:3, rating:"A", name:"CPU «Такт-4»",
    mass:0.12, price:210000, stats:{ threads:4 } },
  { id:"ram_8", slot:"ram", cls:1, rating:"E", name:"RAM ОЗУ-8",
    mass:0.04, price:8000, stats:{ capacityKb:8 } },
  { id:"ram_32", slot:"ram", cls:2, rating:"C", name:"RAM ОЗУ-32",
    mass:0.06, price:36000, stats:{ capacityKb:32 } },
  { id:"ram_64", slot:"ram", cls:3, rating:"A", name:"RAM ОЗУ-64",
    mass:0.08, price:110000, stats:{ capacityKb:64 } },
  { id:"ram_128", slot:"ram", cls:4, rating:"S", name:"RAM ОЗУ-128",
    mass:0.12, price:300000, stats:{ capacityKb:128 } },
  { id:"ram_256", slot:"ram", cls:4, rating:"S", name:"RAM ОЗУ-256",
    mass:0.12, price:300000, stats:{ capacityKb:256 } },
  { id:"ram_512", slot:"ram", cls:4, rating:"S", name:"RAM ОЗУ-512",
    mass:0.12, price:300000, stats:{ capacityKb:512 } },
  { id:"ram_1024", slot:"ram", cls:4, rating:"S", name:"RAM ОЗУ-1024",
    mass:0.12, price:300000, stats:{ capacityKb:1024 } },
  { id:"ram_4096", slot:"ram", cls:4, rating:"S", name:"RAM ОЗУ-4096",
    mass:0.12, price:300000, stats:{ capacityKb:4096 } },
  /* drive_magnetic is a tape recorder, not the tape itself.  The data stays
     on an individual removable medium instance, including after ejection. */
  { id:"drive_magnetic", slot:"drive", cls:1, rating:"E", name:"Магнитофон МЛ-64",
    mass:0.30, price:12000, stats:{ driveType:"tape", removableMedia:"magnetic_tape", deviceName:"tape0" } },
  { id:"drive_chip", slot:"drive", cls:2, rating:"C", name:"Чип памяти ЧП-128",
    mass:0.08, price:74000, stats:{ driveType:"chip", capacityKb:128 } },
  { id:"drive_crystal", slot:"drive", cls:3, rating:"A", name:"Кристалл памяти КР-512",
    mass:0.04, price:360000, stats:{ driveType:"crystal", capacityKb:512 } },
  /* Removable readers occupy a peripheral slot.  Their inserted medium is
     deliberately not a child slot: a tape/disk remains a normal Item that can
     live in cargo, be moved, saved and later inserted into another reader. */
  { id:"drive_floppy", slot:"peripheral", cls:1, rating:"E", name:"Дисковод ФД-144",
    mass:0.24, price:18000, stats:{ driveType:"floppy", removableMedia:"magnetic_disk", deviceName:"fd0", bootable:true } },
  { id:"drive_hard", slot:"peripheral", cls:2, rating:"C", name:"Жёсткий диск ЖД-2048",
    mass:0.42, price:95000, stats:{ driveType:"hard", capacityKb:2048, bootable:true } },
  { id:"drive_hard_big", slot:"peripheral", cls:2, rating:"C", name:"Жёсткий диск ЖД-65535",
    mass:0.42, price:195000, stats:{ driveType:"hard", capacityKb:65535, bootable:true } },
  { id:"drive_installer", slot:"peripheral", cls:3, rating:"A", name:"Установочный носитель PCFD-65535",
    mass:0.46, price:0, stats:{ driveType:"pcfd", capacityKb:65535, bootable:true, installerMedia:true } },
  { id:"magnetic_tape", slot:"media", cls:1, rating:"E", name:"Магнитная лента МЛ-64",
    mass:0.05, price:4500, stats:{ mediaType:"magnetic_tape", capacityKb:64, filesystem:"pcfs" } },
  { id:"magnetic_disk", slot:"media", cls:1, rating:"E", name:"Магнитный диск МД-144",
    mass:0.03, price:7000, stats:{ mediaType:"magnetic_disk", capacityKb:144, filesystem:"pcfs" } },
  { id:"magnetic_disk_scanner", slot:"media", cls:1, rating:"E", name:"Магнитный диск «PCOS Scanner»",
    mass:0.03, price:0, stats:{ mediaType:"magnetic_disk", capacityKb:144, filesystem:"pcfs", scannerMedia:true } }
];

export const byId = id => CATALOG.find(d => d.id === id) || null;
export const bySlot = slot => CATALOG.filter(d => d.slot === slot);

function ensureDirectory(fs,path){
  let current=fs.readInode(fs.rootId);
  for(const name of String(path).split("/").filter(Boolean)){
    let id=fs.dirLookup(current,name);
    if(!id){
      id=fs.allocateInode(INODE_TYPES.DIRECTORY,0,0,0o755);
      fs.dirAddEntry(current,name,id);
    }
    current=fs.readInode(id);
  }
  return current;
}

/** Creates a tiny PCFS volume for a removable medium.  It is intentionally
 * local to the Item instance so two visually identical disks never share data. */
function formatMedia(storage,{scanner=false}={}){
  const blocks=Math.max(32,Math.floor((storage.ramKb*1024)/512));
  const fs=new InodeFS(blocks);
  if(scanner){
    const bin=ensureDirectory(fs,"/usr/bin"),docs=ensureDirectory(fs,"/usr/share/doc/pcos-scanner");
    let id=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o755);
    fs.dirAddEntry(bin,"scanner.bin",id);fs.writeData(fs.readInode(id),SCANNER_BIN);
    const readme=new TextEncoder().encode("PCOS Scanner magnetic disk\nMount: mount /dev/fd0 /mnt/scanner\nRun: scanner\n");
    id=fs.allocateInode(INODE_TYPES.REGULAR,0,0,0o644);
    fs.dirAddEntry(docs,"README",id);fs.writeData(fs.readInode(id),readme);
    storage.saveBinary("scanner.bin",SCANNER_BIN);
  }
  storage.pcfsImage=fs.serialize();
  storage.filesystem="pcfs";
}

/** Экземпляр предмета: определение + количество. */
export class Item {
  constructor(defId, qty = 1){
    this.def = byId(defId);
    if (!this.def) throw new Error("Неизвестный предмет: " + defId);
    this.qty = qty;
    this.instanceId=`item-${nextItemInstanceId++}`;
    this.slots = {};
    for (const slot of this.def.slots || []){
      const defaultId = this.def.defaults?.[slot.id];
      this.slots[slot.id] = defaultId ? new Item(defaultId) : null;
    }
    if ((this.slot === "drive" || this.stats.driveType || this.stats.mediaType) && !this.stats.removableMedia){
      this.storage = new ComputerMemory(this.stats.capacityKb);
      if(this.stats.mediaType){
        this.storage.programs=[];
        formatMedia(this.storage,{scanner:!!this.stats.scannerMedia});
      }
      if(this.stats.installerMedia){
        this.storage.programs=[];
        const pcfd=Uint8Array.from(atob(INSTALL_PCFD_BASE64),char=>char.charCodeAt(0));
        this.storage.saveBinary("os.bin",INSTALLER_BINARY);
        this.storage.saveBinary("installer.bin",INSTALLER_BINARY);
        this.storage.saveBinary("install.pcfd",pcfd);
        this.storage.save("install.conf","unattended=true\nroot_password=root\nguest=true\nboot_file=kernel.bin\n");
        this.storage.installerPackage=pcfd;
        this.storage.installationMedia=true;
      }
    }
    if(this.stats.removableMedia)this.insertedMedia=null;
    if (this.slot === "computer"){
      this.firmware = new ComputerFirmware();
      this.runtime = new ComputerRuntime(this);
    }
  }
  get id(){ return this.def.id; }
  get slot(){ return this.def.slot; }
  get name(){ return this.def.name; }
  get mass(){
    const fitted = Object.values(this.slots).reduce((sum, item) => sum + (item?.mass || 0), 0);
    return (this.def.mass + fitted)*this.qty;
  }
  get tag(){ return this.def.cls + this.def.rating; }
  get stats(){ return this.def.stats || {}; }
  get slotDefs(){ return this.def.slots || []; }
  get memory(){
    return this.slots.drive?.storage || Object.values(this.slots).find(item=>item?.storage)?.storage || null;
  }
  canInsertMedia(media){
    return !!media&&!!this.stats.removableMedia&&media.stats.mediaType===this.stats.removableMedia;
  }
  insertMedia(media){
    if(!this.canInsertMedia(media))throw new Error(`Носитель несовместим с ${this.name}`);
    const old=this.insertedMedia;this.insertedMedia=media;return old;
  }
  ejectMedia(){const media=this.insertedMedia;this.insertedMedia=null;return media;}
  compatibleSlot(item){
    if(!item)return null;
    if(Object.hasOwn(this.slots,item.slot))return item.slot;
    if(item.slot==="peripheral")return this.slotDefs.find(slot=>
      slot.id.startsWith("peripheral")&&!this.slots[slot.id])?.id || null;
    return null;
  }
  accepts(item){ return !!this.compatibleSlot(item); }
  install(item){
    const slot=this.compatibleSlot(item);
    if (!slot) return null;
    const old = this.slots[slot];
    this.slots[slot] = item;
    return old;
  }
  uninstall(slot){
    if (!Object.hasOwn(this.slots, slot)) return null;
    const old = this.slots[slot];
    this.slots[slot] = null;
    return old;
  }
  clone(qty){
    const copy = new Item(this.def.id, qty ?? this.qty);
    for (const slot of this.slotDefs){
      copy.slots[slot.id] = this.slots[slot.id]?.clone() || null;
    }
    copy.insertedMedia=this.insertedMedia?.clone?.()||null;
    return copy;
  }
}
export const makeItem = (id, qty = 1) => new Item(id, qty);

/** Человекочитаемые характеристики предмета для панели. */
export function itemStatLines(def){
  const s = def.stats || {};
  const out = [];
  if (def.slot === "computer"){
    const peripherals=(def.slots||[]).filter(slot=>slot.id.startsWith("peripheral")).length;
    out.push("слоты GPU · CPU · RAM · DRIVE · периферия ×"+peripherals);
  } else if (def.slot === "gpu"){
    out.push("вывод: " + (s.output === "graphics" ? "графика" : "текст"));
  } else if (def.slot === "cpu"){
    out.push("потоки " + s.threads);
  } else if (def.slot === "ram"){
    out.push("оперативная память " + s.capacityKb + " КБ");
  } else if (def.slot === "peripheral" && s.network){
    out.push("сеть " + s.speed + " Мбит/с", "драйвер " + s.driver);
  } else if (def.slot === "drive" || def.slot === "peripheral"){
    const types = { tape:"магнитофон", chip:"чип", crystal:"кристалл", floppy:"дисковод", hard:"жёсткий диск", pcfd:"дисковод с установочным носителем" };
    out.push("тип: " + (types[s.driveType]||s.driveType||"накопитель"));
    if(s.removableMedia){
      const media={magnetic_tape:"магнитная лента",magnetic_disk:"магнитный диск"}[s.removableMedia]||s.removableMedia;
      out.push("съёмный носитель: "+media);
    }else if(Number.isFinite(s.capacityKb))out.push("память " + s.capacityKb + " КБ");
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
  } else if (def.slot === "reactor"){
    out.push("грейд " + s.grade, "мощность " + s.power + " МВт");
  } else if (def.slot === "shield"){
    out.push("щит " + s.capacity, "реген " + s.regen + "/с");
  } else if (def.slot === "droid"){
    out.push("ремонт " + s.repair + " ед/с");
  } else if (def.slot === "gyro"){
    out.push("поворот " + s.turnRate + " рад/с");
  } else if (def.slot === "weapon"){
    const type={laser:"лазер",energy:"энергия",kinetic:"кинетика",missile:"ракеты",torpedo:"торпеды",emp:"ЭМИ",nuclear:"ядерные торпеды",mine:"мины"}[s.weaponType] || "оружие";
    out.push(type, "урон " + s.damage, "дальность " + s.range + " du", s.ammo ? "боезапас " + s.ammo : "боезапас: энергия");
  }
  out.push("масса " + def.mass + " т");
  return out;
}
