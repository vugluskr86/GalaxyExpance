/** Планировщик манёвров в духе KSP.
 *
 *  Узел — это не мгновенный импульс, а ПЛАН: точка на орбите (время до
 *  узла) плюс вектор Δv в осях prograde/radial. Игра показывает орбиту
 *  после манёвра, требуемую Δv, длительность прожига и запас корабля,
 *  а исполняет узел настоящий двигатель за конечное время. */

import { propagate, elements, timeToApo, timeToPeri } from "./physics.js";
import { DU_M } from "./units.js";

export class ManeuverNode {
  /** @param eta  время до узла, с
   *  @param dvPro/dvRad — Δv в м/с (prograde / radial-out) */
  constructor(eta, dvPro = 0, dvRad = 0){
    this.eta = eta;
    this.dvPro = dvPro;
    this.dvRad = dvRad;
    this.executing = false;
  }
  get dv(){ return Math.hypot(this.dvPro, this.dvRad); }
}

/** Состояние корабля в момент узла (коастинг по конике). */
export function stateAtNode(mu, st, eta){
  return propagate(mu, st.rx, st.ry, st.rvx, st.rvy, eta);
}

/** Вектор Δv узла, разложенный в мировые оси (du/с). */
export function nodeDvVector(state, node){
  const v = Math.hypot(state.vx, state.vy) || 1e-9;
  const px = state.vx/v, py = state.vy/v;                 // prograde
  const r = Math.hypot(state.rx, state.ry) || 1e-9;
  const rx = state.rx/r, ry = state.ry/r;                 // radial-out
  const pro = node.dvPro/DU_M, rad = node.dvRad/DU_M;
  return [px*pro + rx*rad, py*pro + ry*rad];
}

/** Состояние сразу после исполнения узла. */
export function stateAfterNode(mu, st, node){
  const s = stateAtNode(mu, st, node.eta);
  const [dx, dy] = nodeDvVector(s, node);
  return { rx:s.rx, ry:s.ry, vx:s.vx + dx, vy:s.vy + dy };
}

/** Орбита, которая получится после манёвра. */
export function orbitAfterNode(mu, st, node){
  const s = stateAfterNode(mu, st, node);
  return elements(mu, s.rx, s.ry, s.vx, s.vy);
}

/* ---------------- готовые планы ---------------- */

/** Циркуляризация в апоцентре (или перицентре — что ближе к цели). */
export function planCircularize(mu, st, atApo = true){
  const el = elements(mu, st.rx, st.ry, st.rvx, st.rvy);
  if (!isFinite(el.period) && atApo) return null;
  const eta = atApo ? timeToApo(el) : timeToPeri(el);
  if (!isFinite(eta)) return null;
  const s = stateAtNode(mu, st, eta);
  const r = Math.hypot(s.rx, s.ry);
  const v = Math.hypot(s.vx, s.vy);
  const vCirc = Math.sqrt(mu/r);
  /* в апсиде скорость чисто трансверсальна — хватает prograde-составляющей */
  return new ManeuverNode(eta, (vCirc - v)*DU_M, 0);
}

/** Гомановский переход на круговую орбиту радиуса r2: узел на подъём. */
export function planHohmann(mu, st, r2){
  const el = elements(mu, st.rx, st.ry, st.rvx, st.rvy);
  const r1 = el.r;
  if (Math.abs(r1 - r2) < 1e-6) return null;
  const a = (r1 + r2)/2;
  const v1 = Math.hypot(st.rvx, st.rvy);
  const vT = Math.sqrt(mu*(2/r1 - 1/a));
  return new ManeuverNode(0, (vT - v1)*DU_M, 0);
}

/** Δv второго импульса гомана (циркуляризация в апсиде перехода). */
export function hohmannSecondDv(mu, r1, r2){
  const a = (r1 + r2)/2;
  const vArr = Math.sqrt(mu*(2/r2 - 1/a));
  const vCirc = Math.sqrt(mu/r2);
  return (vCirc - vArr)*DU_M;
}

/** Полная смета перехода r1→r2, м/с. */
export function hohmannBudget(mu, r1, r2){
  const a = (r1 + r2)/2;
  const dv1 = (Math.sqrt(mu*(2/r1 - 1/a)) - Math.sqrt(mu/r1))*DU_M;
  const dv2 = hohmannSecondDv(mu, r1, r2);
  return { dv1, dv2, total: Math.abs(dv1) + Math.abs(dv2),
           transferTime: Math.PI*Math.sqrt(a*a*a/mu) };
}
