/**
 * balance.js — Центральный реестр конфигураций, live-настройка и undo/redo.
 * 
 * Все числовые параметры игры, влияющие на баланс, хранятся здесь.
 * Изменения применяются мгновенно через setConfig() и сохраняются
 * только в сессии (не в savegame). Undo/redo позволяет безопасно
 * экспериментировать с настройками.
 */
const CONFIG_SCHEMA = [
  /* ─── экономика ────────────────────────────────────────────────────────── */
  { path: "economy.basePriceMultiplier", domain: "economy", label: "Множитель базовых цен", min: 0.1, max: 10, step: 0.1 },
  { path: "economy.tradeTax", domain: "economy", label: "Торговый налог", min: 0, max: 0.5, step: 0.01 },
  { path: "economy.contractRewardMultiplier", domain: "economy", label: "Множитель наград контрактов", min: 0.5, max: 5, step: 0.1 },
  { path: "economy.repairCostPerHp", domain: "economy", label: "Стоимость ремонта за HP", min: 1, max: 500, step: 1 },
  { path: "economy.stationRestockInterval", domain: "economy", label: "Интервал пополнения станций (дни)", min: 1, max: 30, step: 1 },
  { path: "economy.dailyInterestRate", domain: "economy", label: "Дневная процентная ставка", min: 0, max: 0.05, step: 0.001 },
  { path: "economy.marketTargetBase", domain: "economy", label: "Базовый резерв рынка", min: 1, max: 500, step: 1 },
  { path: "economy.marketTargetRandom", domain: "economy", label: "Разброс резерва рынка", min: 0, max: 200, step: 1 },
  { path: "economy.producerSurplus", domain: "economy", label: "Избыток производителя", min: 0, max: 300, step: 1 },
  { path: "economy.consumerReserve", domain: "economy", label: "Резерв потребителя", min: 0, max: 300, step: 1 },
  { path: "economy.startCredits", domain: "economy", label: "Стартовые кредиты", min: 0, max: 1000000, step: 100 },
  { path: "economy.transactionHistory", domain: "economy", label: "Размер журнала транзакций", min: 10, max: 1000, step: 10 },
  /* ─── эффекты/частицы ──────────────────────────────────────────────────── */
  { path: "effects.maxParticlesLod0", domain: "effects", label: "Макс. частиц (LOD 0)", min: 10, max: 2000, step: 10 },
  { path: "effects.maxParticlesLod1", domain: "effects", label: "Макс. частиц (LOD 1)", min: 5, max: 500, step: 5 },
  { path: "effects.maxParticlesLod2", domain: "effects", label: "Макс. частиц (LOD 2)", min: 0, max: 100, step: 5 },
  { path: "effects.explosionScale", domain: "effects", label: "Масштаб взрывов", min: 0.5, max: 5, step: 0.1 },
  /* ─── рендер ───────────────────────────────────────────────────────────── */
  { path: "render.systemZoomDefault", domain: "render", label: "Системный зум по умолчанию", min: 0.1, max: 5, step: 0.1 },
  { path: "render.systemZoomMin", domain: "render", label: "Мин. системный зум", min: 0.02, max: 1, step: 0.01 },
  { path: "render.systemZoomMax", domain: "render", label: "Макс. системный зум", min: 1, max: 20, step: 0.5 },
  { path: "render.systemZoomWheel", domain: "render", label: "Шаг зума колёсиком", min: 1.1, max: 3, step: 0.1 },
  { path: "render.surfaceCanvasSize", domain: "render", label: "Размер canvas поверхности", min: 200, max: 800, step: 10 },
  { path: "render.twinkleIntensity", domain: "render", label: "Интенсивность мерцания звёзд", min: 0, max: 1, step: 0.05 },
  /* ─── телеметрия ───────────────────────────────────────────────────────── */
  { path: "telemetry.sampleIntervalSec", domain: "telemetry", label: "Интервал сэмплирования (сек)", min: 0.1, max: 10, step: 0.1 },
  { path: "telemetry.maxSamples", domain: "telemetry", label: "Макс. число сэмплов", min: 10, max: 1000, step: 10 },
  { path: "telemetry.maxEvents", domain: "telemetry", label: "Макс. число событий", min: 10, max: 500, step: 10 },
  /* ─── бой ──────────────────────────────────────────────────────────────── */
  { path: "combat.baseDamage", domain: "combat", label: "Базовый урон", min: 1, max: 100, step: 1 },
  { path: "combat.shieldRegenRate", domain: "combat", label: "Скорость регенерации щита", min: 0.1, max: 10, step: 0.1 },
  { path: "combat.npcAccuracy", domain: "combat", label: "Точность NPC", min: 0.1, max: 1, step: 0.05 },
  /* ─── NPC ──────────────────────────────────────────────────────────────── */
  { path: "npc.spawnIntervalDays", domain: "npc", label: "Интервал спавна NPC (дни)", min: 1, max: 30, step: 1 },
  { path: "npc.maxNpcsPerSystem", domain: "npc", label: "Макс. NPC в системе", min: 1, max: 50, step: 1 },
  { path: "npc.aggressionChance", domain: "npc", label: "Шанс агрессии NPC", min: 0, max: 1, step: 0.05 },
  /* ─── генерация ────────────────────────────────────────────────────────── */
  { path: "generation.anomalyChance", domain: "generation", label: "Шанс аномалии", min: 0, max: 1, step: 0.01 },
  { path: "generation.richAsteroidChance", domain: "generation", label: "Шанс богатого астероида", min: 0, max: 1, step: 0.01 },
  { path: "generation.stationDensity", domain: "generation", label: "Плотность станций", min: 0.1, max: 5, step: 0.1 },
];

const defaults = {};
for (const entry of CONFIG_SCHEMA) {
  const parts = entry.path.split(".");
  let target = defaults;
  for (let i = 0; i < parts.length - 1; i++) {
    target[parts[i]] = target[parts[i]] || {};
    target = target[parts[i]];
  }
  // Значения по умолчанию — середина диапазона или разумное значение
  if (entry.path === "economy.basePriceMultiplier") target[parts[parts.length - 1]] = 1;
  else if (entry.path === "economy.tradeTax") target[parts[parts.length - 1]] = 0.05;
  else if (entry.path === "economy.contractRewardMultiplier") target[parts[parts.length - 1]] = 1;
  else if (entry.path === "economy.repairCostPerHp") target[parts[parts.length - 1]] = 10;
  else if (entry.path === "economy.stationRestockInterval") target[parts[parts.length - 1]] = 3;
  else if (entry.path === "economy.dailyInterestRate") target[parts[parts.length - 1]] = 0;
  else if (entry.path === "economy.marketTargetBase") target[parts[parts.length - 1]] = 42;
  else if (entry.path === "economy.marketTargetRandom") target[parts[parts.length - 1]] = 26;
  else if (entry.path === "economy.producerSurplus") target[parts[parts.length - 1]] = 28;
  else if (entry.path === "economy.consumerReserve") target[parts[parts.length - 1]] = 18;
  else if (entry.path === "economy.startCredits") target[parts[parts.length - 1]] = 2500;
  else if (entry.path === "economy.transactionHistory") target[parts[parts.length - 1]] = 160;
  else if (entry.path === "effects.maxParticlesLod0") target[parts[parts.length - 1]] = 200;
  else if (entry.path === "effects.maxParticlesLod1") target[parts[parts.length - 1]] = 80;
  else if (entry.path === "effects.maxParticlesLod2") target[parts[parts.length - 1]] = 20;
  else if (entry.path === "effects.explosionScale") target[parts[parts.length - 1]] = 1;
  else if (entry.path === "render.systemZoomDefault") target[parts[parts.length - 1]] = 0.8;
  else if (entry.path === "render.systemZoomMin") target[parts[parts.length - 1]] = 0.1;
  else if (entry.path === "render.systemZoomMax") target[parts[parts.length - 1]] = 5;
  else if (entry.path === "render.systemZoomWheel") target[parts[parts.length - 1]] = 1.5;
  else if (entry.path === "render.surfaceCanvasSize") target[parts[parts.length - 1]] = 420;
  else if (entry.path === "render.twinkleIntensity") target[parts[parts.length - 1]] = 0.5;
  else if (entry.path === "telemetry.sampleIntervalSec") target[parts[parts.length - 1]] = 1;
  else if (entry.path === "telemetry.maxSamples") target[parts[parts.length - 1]] = 200;
  else if (entry.path === "telemetry.maxEvents") target[parts[parts.length - 1]] = 100;
  else if (entry.path === "combat.baseDamage") target[parts[parts.length - 1]] = 10;
  else if (entry.path === "combat.shieldRegenRate") target[parts[parts.length - 1]] = 1;
  else if (entry.path === "combat.npcAccuracy") target[parts[parts.length - 1]] = 0.6;
  else if (entry.path === "npc.spawnIntervalDays") target[parts[parts.length - 1]] = 5;
  else if (entry.path === "npc.maxNpcsPerSystem") target[parts[parts.length - 1]] = 12;
  else if (entry.path === "npc.aggressionChance") target[parts[parts.length - 1]] = 0.3;
  else if (entry.path === "generation.anomalyChance") target[parts[parts.length - 1]] = 0.15;
  else if (entry.path === "generation.richAsteroidChance") target[parts[parts.length - 1]] = 0.1;
  else if (entry.path === "generation.stationDensity") target[parts[parts.length - 1]] = 1;
  else target[parts[parts.length - 1]] = Math.round((entry.min + entry.max) / 2);
}

const clone = obj => JSON.parse(JSON.stringify(obj));
const schema = new Map(CONFIG_SCHEMA.map(e => [e.path, e]));
let session = {};
const listeners = new Set();

/* ─── undo/redo ──────────────────────────────────────────────────────────── */
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

/**
 * Сохраняет текущее состояние session в undo-стек перед изменением.
 * Вызывается внутри setConfig().
 */
function pushUndo() {
  undoStack.push(clone(session));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = []; // новое изменение сбрасывает redo
}

/** Отменяет последнее изменение конфигурации. */
export function undoConfig() {
  if (undoStack.length === 0) return null;
  redoStack.push(clone(session));
  session = undoStack.pop();
  const snapshot = configSnapshot();
  for (const listener of listeners) listener({ path: "*", value: null, snapshot });
  return snapshot;
}

/** Повторяет отменённое изменение. */
export function redoConfig() {
  if (redoStack.length === 0) return null;
  undoStack.push(clone(session));
  session = redoStack.pop();
  const snapshot = configSnapshot();
  for (const listener of listeners) listener({ path: "*", value: null, snapshot });
  return snapshot;
}

export function undoAvailable() { return undoStack.length > 0; }
export function redoAvailable() { return redoStack.length > 0; }

/* ─── базовые операции ───────────────────────────────────────────────────── */
const pathParts = path => String(path).split(".");
const at = (object, path) => pathParts(path).reduce((value, key) => value?.[key], object);
const put = (object, path, value) => {
  const parts = pathParts(path), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ?? (target[part] = {});
  target[last] = value;
};
const merge = (base, extra) => {
  const out = clone(base);
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === "object" && !Array.isArray(value))
      out[key] = merge(out[key] || {}, value);
    else out[key] = value;
  }
  return out;
};
function valid(path, value) {
  const definition = schema.get(path);
  if (!definition || !Number.isFinite(Number(value))) return false;
  return Number(value) >= definition.min && Number(value) <= definition.max;
}
export const configSnapshot = () => merge(defaults, session);
export const configValue = path => at(configSnapshot(), path);
export function configEntries(domain) {
  return CONFIG_SCHEMA.filter(definition => definition.domain === domain)
    .map(definition => ({ ...definition, value: configValue(definition.path) }));
}
export function setConfig(path, value) {
  if (!valid(path, value)) throw new RangeError(`Invalid config ${path}`);
  pushUndo();
  put(session, path, Number(value));
  const snapshot = configSnapshot();
  for (const listener of listeners) listener({ path, value: Number(value), snapshot });
  return snapshot;
}
export function resetConfig(path = null) {
  pushUndo();
  if (path) {
    const parts = pathParts(path), last = parts.pop();
    let target = session;
    for (const part of parts) { if (!target[part]) return configSnapshot(); target = target[part]; }
    delete target[last];
  } else {
    session = {};
  }
  const snapshot = configSnapshot();
  for (const listener of listeners) listener({ path, value: null, snapshot });
  return snapshot;
}
export const onConfigChange = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const STORE_KEY = "pixel-cosmos.balance-presets";
export function saveConfigPreset(name = "default") {
  const saved = loadConfigPresets();
  saved[String(name).trim() || "default"] = clone(session);
  globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(saved));
  return saved;
}
export function loadConfigPresets() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}
export function applyConfigPreset(name) {
  const preset = loadConfigPresets()[name];
  if (!preset) throw new Error(`Preset ${name} not found`);
  pushUndo();
  session = merge({}, preset);
  const snapshot = configSnapshot();
  for (const listener of listeners) listener({ path: "*", value: null, snapshot });
  return snapshot;
}
export const exportConfig = () => JSON.stringify({ version: 1, overrides: session }, null, 2);
export function importConfig(source) {
  const parsed = typeof source === "string" ? JSON.parse(source) : source;
  if (!parsed || parsed.version !== 1 || typeof parsed.overrides !== "object")
    throw new TypeError("Invalid balance config");
  for (const entry of CONFIG_SCHEMA) {
    const value = at(parsed.overrides, entry.path);
    if (value !== undefined && !valid(entry.path, value))
      throw new RangeError(`Invalid config ${entry.path}`);
  }
  pushUndo();
  session = clone(parsed.overrides);
  const snapshot = configSnapshot();
  for (const listener of listeners) listener({ path: "*", value: null, snapshot });
  return snapshot;
}
