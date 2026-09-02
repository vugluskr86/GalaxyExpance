/** Единицы измерения и калибровка мира.
 *
 *  1 du (игровая единица длины) = 1 000 км.
 *  1 единица времени = 1 секунда симуляции.
 *
 *  Планетарная механика при таком масштабе выходит РЕАЛЬНОЙ:
 *  низкая орбита у землеподобной планеты — 7.6 км/с и ~3.5 часа,
 *  вторая космическая ~11 км/с, гравитация у поверхности 5–10 м/с².
 *  Гелиоцентрический масштаб сжат (система целиком ~700 тыс. км),
 *  поэтому «год» здесь длится часы, а не месяцы — иначе межпланетные
 *  перелёты были бы неиграбельны. Скорости при этом остаются
 *  солнечно-системными: 20–55 км/с на орбитах планет. */

export const DU_M   = 1e6;        // метров в одной игровой единице
export const G0     = 9.80665;    // м/с² — для удельного импульса
export const G_CONST = 6.674e-11; // м³/(кг·с²)

/** μ звезды подобрана так, чтобы планета на 350 du шла ~30 км/с. */
export const MU_SUN = 0.3;        // du³/с²

/** Плотности по типам тел, кг/м³. Рисованные радиусы завышены,
 *  поэтому плотности масштабируются DENSITY_SCALE — иначе поверхностная
 *  гравитация уехала бы за 20 м/с². */
export const DENSITY = {
  terran:5500, ocean:3000, desert:4200, ice:1600,
  lava:5800, gas:1300, alien:4000, moon:3300, star:1400
};
export const DENSITY_SCALE = 0.35;

/* ---------- перевод в человеческие единицы ---------- */
export const duToKm    = du => du * (DU_M/1000);
export const duToM     = du => du * DU_M;
export const msToDu    = ms => ms / DU_M;          // м/с → du/с
export const duToMs    = du => du * DU_M;          // du/с → м/с
export const accMsToDu = a  => a / DU_M;           // м/с² → du/с²

/** Formats a raw number for UI readouts without ever showing NaN. */
export function fmtNumber(value,digits=0,fallback="—"){
  const number=Number(value);
  return Number.isFinite(number)?number.toFixed(digits):fallback;
}
export function fmtSpeed(duPerS){
  const ms = duPerS * DU_M;
  if(!Number.isFinite(ms))return "—";
  if (Math.abs(ms) >= 1e7) return (ms/299792458).toFixed(2) + " c";
  if (Math.abs(ms) >= 1000) return (ms/1000).toFixed(2) + " км/с";
  return Math.round(ms) + " м/с";
}
export function fmtDist(du){
  const km = du * (DU_M/1000);
  if(!Number.isFinite(km))return "—";
  if (Math.abs(km) >= 1e6) return (km/1e6).toFixed(2) + " млн км";
  if (Math.abs(km) >= 1e4) return Math.round(km/1000) + " тыс. км";
  return Math.round(km).toLocaleString("ru-RU") + " км";
}
export function fmtDv(ms){
  if (Number.isNaN(Number(ms))) return "—";
  if (!isFinite(ms)) return "∞";
  if (Math.abs(ms) >= 1000) return (ms/1000).toFixed(2) + " км/с";
  return Math.round(ms) + " м/с";
}
export function fmtTime(sec){
  if (Number.isNaN(Number(sec))) return "—";
  if (!isFinite(sec)) return "∞";
  const s = Math.abs(Math.round(sec));
  const sign = sec < 0 ? "−" : "";
  const d = Math.floor(s/86400), h = Math.floor(s%86400/3600);
  const m = Math.floor(s%3600/60), ss = s%60;
  if (d) return `${sign}${d}д ${h}ч`;
  if (h) return `${sign}${h}ч ${String(m).padStart(2,"0")}м`;
  if (m) return `${sign}${m}м ${String(ss).padStart(2,"0")}с`;
  return `${sign}${ss}с`;
}
export function fmtMass(t){
  if(!Number.isFinite(Number(t)))return "—";
  if (t >= 1000) return (t/1000).toFixed(2) + " кт";
  return t.toFixed(1) + " т";
}
export function fmtAcc(duPerS2){
  if(!Number.isFinite(Number(duPerS2)))return "—";
  return (duPerS2 * DU_M).toFixed(2) + " м/с²";
}
