/** Игровая консоль: регистр команд с разделением на легальные и читерские.
 *  Все строковые литералы вынесены в константы. */

import { makeItem, byId } from "./items.js";
import { fmtDist, fmtSpeed, fmtDv, fmtTime } from "./units.js";
import { settings } from "../ui/settings.js";

/* --- константы категорий --- */
export const CAT_LEGAL = "legal";
export const CAT_CHEAT = "cheat";

/* --- константы сообщений --- */
const MSG_HELP = `Консоль управления. Легальные команды (доступны через интерфейс):
  help          — эта справка
  info          — характеристики корабля и орбиты
  status        — текущий статус (режим, топливо, скорость)
  orbit <h>     — запланировать циркуляризацию на высоте h (du)
  circ          — циркуляризовать орбиту в текущей точке
  fsd <планета> — FSD к планете (по букве: b, c, d, ...)
  land          — посадка (если условия выполнены)
  takeoff       — взлёт с поверхности
  speed <n>     — установить скорость симуляции (1, 2, 5, 10)

Читерские команды (только для отладки):
  give <id> [q] — выдать предмет (id из каталога, q=1)
  fuel <n>      — установить топливо (тонн)
  refuel        — заправить бак полностью`;

const SPEED_MAP = { "1":1, "2":2, "5":5, "10":10 };
const PLANET_LETTERS = "bcdefgh";

/** @type {Array<{name:string, cat:string, help:string, fn:function}>} */
export const COMMANDS = [];

const cmd = (name, cat, help, fn) => COMMANDS.push({ name, cat, help, fn });

/* ======== легальные команды ======== */

cmd("help", CAT_LEGAL, "справка по командам", (ctx, args, print) => {
  print(MSG_HELP);
});

cmd("info", CAT_LEGAL, "характеристики корабля", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh){ print("корабль отсутствует"); return; }
  const p = sh.prop;
  print(`Корабль · режим: ${sh.mode}`);
  print(`  двигатель: ${p.engine.name} · бак: ${p.tank.name}`);
  print(`  масса: ${(p.mass).toFixed(1)} т · топливо: ${p.fuel.toFixed(1)}/${p.fuelCap} т`);
  print(`  ΔV: ${fmtDv(p.deltaV)} · тяга: ${p.engine.thrust} кН · Isp: ${p.engine.isp} с`);
  const els = sh.els(ctx);
  if (els){
    print(`  орбита: h=${fmtDist(els.r - els.ps.bodyR)} · v=${fmtSpeed(els.v)}`);
    if (isFinite(els.period)) print(`  период: ${fmtTime(els.period)} · e=${els.e.toFixed(3)}`);
    else print(`  траектория: гиперболическая e=${els.e.toFixed(3)}`);
  }
});

cmd("status", CAT_LEGAL, "текущий статус", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh){ print("корабль отсутствует"); return; }
  print(`режим: ${sh.mode} · скорость симуляции: ×${settings.speed}`);
  print(`топливо: ${sh.prop.fuel.toFixed(1)}/${sh.prop.fuelCap} т · ΔV: ${fmtDv(sh.prop.deltaV)}`);
  if (sh.mode === "newton"){
    const els = sh.els(ctx);
    if (els) print(`h=${fmtDist(els.r - els.ps.bodyR)} · v=${fmtSpeed(els.v)}`);
  }
  if (sh.mode === "cruise") print(`FSD скорость: ${fmtSpeed(sh.cruiseV)}`);
});

cmd("orbit", CAT_LEGAL, "циркуляризация на высоте h", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh || sh.mode !== "newton"){ print("доступно только в ньютоновом режиме"); return; }
  const h = parseFloat(args[0]);
  if (isNaN(h) || h < 0){ print("orbit <высота_du> — например: orbit 20"); return; }
  ctx.orbitAlt = h;
  ctx.planTransfer();
  print(`запланирован переход на высоту ${fmtDist(h)}`);
});

cmd("circ", CAT_LEGAL, "циркуляризовать орбиту", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh || sh.mode !== "newton"){ print("доступно только в ньютоновом режиме"); return; }
  const atApo = args[0] === "apo";
  ctx.planCirc(atApo);
  print(atApo ? "циркуляризация в апоцентре" : "циркуляризация в перицентре");
});

cmd("fsd", CAT_LEGAL, "FSD к планете по букве", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh){ print("корабль отсутствует"); return; }
  const letter = (args[0] || "").toLowerCase();
  const idx = PLANET_LETTERS.indexOf(letter);
  if (idx < 0 || idx >= ctx.S.planets.length){ print(`планета '${letter}' не найдена. Доступны: ${PLANET_LETTERS.slice(0, ctx.S.planets.length)}`); return; }
  const sel = { kind:"planet", i:idx, j:0 };
  sh.fsdTo(sel, ctx.orbitAlt);
  ctx.sel = sel;
  ctx.mgr?.onChange?.();
  print(`FSD к планете ${letter.toUpperCase()} · высота ${fmtDist(ctx.orbitAlt)}`);
});

cmd("land", CAT_LEGAL, "посадка", (ctx, args, print) => {
  if (ctx.canLand()){
    ctx.playerShip.land(ctx.sel);
    print("посадка выполнена");
    ctx.mgr?.onChange?.();
  } else {
    print("условия посадки не выполнены (низкая орбита, твёрдое тело)");
  }
});

cmd("takeoff", CAT_LEGAL, "взлёт", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh || sh.mode !== "landed"){ print("корабль не на поверхности"); return; }
  sh.takeoff(ctx, ctx.orbitAlt);
  print(`взлёт · высота ${fmtDist(ctx.orbitAlt)}`);
  ctx.mgr?.onChange?.();
});

cmd("speed", CAT_LEGAL, "скорость симуляции", (ctx, args, print) => {
  const v = SPEED_MAP[args[0]];
  if (v === undefined){ print("speed <1|2|5|10>"); return; }
  settings.speed = v;
  print(`скорость ×${v}`);
});

/* ======== читерские команды ======== */

cmd("give", CAT_CHEAT, "выдать предмет", (ctx, args, print) => {
  const id = args[0];
  const qty = parseInt(args[1]) || 1;
  if (!byId(id)){ print(`предмет '${id}' не найден в каталоге`); return; }
  const item = makeItem(id, qty);
  const sh = ctx.playerShip;
  if (sh){
    const target = item.slot === "cargo" ? sh.prop.cargo : sh.prop.inventory;
    target.add(item);
  }
  print(`выдан: ${item.name} ×${qty}`);
});

cmd("fuel", CAT_CHEAT, "установить топливо", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh){ print("корабль отсутствует"); return; }
  const amount = parseFloat(args[0]);
  if (isNaN(amount) || amount < 0){ print("fuel <тонны>"); return; }
  sh.prop.fuel = Math.min(amount, sh.prop.fuelCap);
  print(`топливо: ${sh.prop.fuel.toFixed(1)}/${sh.prop.fuelCap} т`);
});

cmd("refuel", CAT_CHEAT, "заправить бак полностью", (ctx, args, print) => {
  const sh = ctx.playerShip;
  if (!sh){ print("корабль отсутствует"); return; }
  sh.prop.refuel();
  print(`бак полон: ${sh.prop.fuel.toFixed(1)}/${sh.prop.fuelCap} т`);
});

/** Выполнить команду. Возвращает строку для вывода. */
export function execCommand(ctx, input, print){
  const trimmed = input.trim();
  if (!trimmed) return;
  const parts = trimmed.split(/\s+/);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);
  const entry = COMMANDS.find(c => c.name === name);
  if (!entry){ print(`неизвестная команда: ${name}. help — список команд`); return; }
  entry.fn(ctx, args, print);
}