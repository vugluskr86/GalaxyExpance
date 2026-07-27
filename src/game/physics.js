/** Патч-коники в духе KSP.
 *
 *  Ключевое отличие от прошлой версии: корабль движется НЕ численным
 *  интегрированием, а точным решением задачи двух тел (универсальные
 *  переменные Ланкастера—Блэнчарда/Стумпфа). Пока двигатель молчит,
 *  орбита «на рельсах»: энергия не дрейфует, ускорение времени в 10 000×
 *  не портит траекторию, а нарисованная орбита — настоящая коника,
 *  а не результат интегрирования вперёд.
 *
 *  Интегрирование включается только на активном участке (работа двигателя). */

import { MU_SUN, G_CONST, DU_M, DENSITY, DENSITY_SCALE } from "./units.js";
export { MU_SUN } from "./units.js";

/* ---------------- гравитационные параметры ---------------- */

/** μ тела, du³/с². Считается из рисованного радиуса и плотности типа. */
export function muOf(kind, o){
  if (kind === "star") return MU_SUN;
  if (!o) return 0;
  if (kind === "comet" || kind === "rock") return 0;   // малые тела не гравитируют
  const rho = (DENSITY[o.type] || DENSITY.moon) * DENSITY_SCALE;
  const Rm = (o.size || 8)/2 * DU_M;
  const muM = G_CONST * rho * (4/3)*Math.PI * Rm*Rm*Rm;  // м³/с²
  return muM / (DU_M*DU_M*DU_M);
}
export function bodyROf(o){ return o && o.size ? o.size/2 : 4; }

/** Поверхностная гравитация тела, du/с². */
export function surfaceG(kind, o){
  const R = bodyROf(o);
  return R > 0 ? muOf(kind, o)/(R*R) : 0;
}

/** Сфера влияния.
 *
 *  Классическая формула r = a·(μ/μ_родителя)^(2/5) в этом мире даёт SOI
 *  МЕНЬШЕ самой планеты: рисованные радиусы завышены в тысячи раз
 *  относительно орбит. Поэтому SOI зажата снизу кратностью радиуса тела
 *  (чтобы вокруг было где летать) и сверху долей орбиты (чтобы сферы
 *  соседей не перекрывались). Именно из-за микроскопической SOI корабль
 *  раньше «пролетал мимо» — окно захвата было в пару кадров. */
export function soiOf(kind, o, parentDist, parentMu, gap){
  if (kind === "star") return 1e9;
  const mu = muOf(kind, o);
  if (mu <= 0) return 0;
  const R = bodyROf(o);
  const hill = parentDist * Math.pow(mu/parentMu, 0.4);
  const lo = R * 6;                      // чтобы вокруг тела было где летать
  /* потолок: сферы соседей не должны перекрываться */
  let hi = parentDist * 0.28;
  if (gap) hi = Math.min(hi, gap*0.42);
  return Math.max(Math.min(Math.max(hill, lo), hi), R * 2.2);
}

/** Расстояние до ближайшей соседней орбиты — ограничивает SOI планеты. */
function planetGap(S, i){
  const p = S.planets[i];
  let gap = p.dist;
  for(let k=0;k<S.planets.length;k++){
    if (k === i) continue;
    gap = Math.min(gap, Math.abs(S.planets[k].dist - p.dist));
  }
  return gap;
}

/** Наибольший безопасный радиус орбиты вокруг тела (внутри его SOI). */
export function maxOrbitR(ps){ return ps.soi*0.55; }
/** Радиус орбиты по запрошенной высоте, зажатый в разумные пределы. */
export function safeOrbitR(ps, alt){
  const lo = ps.bodyR*1.12;
  const hi = Math.max(lo + 1, maxOrbitR(ps));
  return Math.min(Math.max(ps.bodyR + alt, lo), hi);
}

const keyOf = s => s.kind + ":" + s.i + ":" + s.j;

/** Угловая скорость кругового движения тела вокруг родителя. */
export function orbitRate(mu, r){ return Math.sqrt(mu/(r*r*r)); }

/* ---------------- состояние тел ---------------- */

/** Позиция/скорость/μ/SOI тела в глобальной раме системы.
 *  Гравитируют только звезда, планеты и луны — у комет и обломков μ = 0,
 *  они остаются целями для стыковки (раньше их фиктивная гравитация
 *  выбрасывала корабль при пересечении «сферы влияния»). */
export function primaryState(sys, selRef){
  const S = sys.S;
  if (!selRef) return null;
  if (selRef.kind === "star"){
    return { x:0, y:0, vx:0, vy:0, mu:MU_SUN, bodyR: S.sun.D/2, soi:1e9,
             key:keyOf(selRef), selRef, kind:"star" };
  }
  if (selRef.kind === "planet"){
    const p = S.planets[selRef.i];
    if (!p) return null;
    const w = orbitRate(MU_SUN, p.dist);
    return {
      x: p._x, y: p._y,
      vx: -Math.sin(p.ang)*w*p.dist, vy: Math.cos(p.ang)*w*p.dist,
      mu: muOf("planet", p), bodyR: bodyROf(p),
      soi: soiOf("planet", p, p.dist, MU_SUN, planetGap(S, selRef.i)),
      key: keyOf(selRef), selRef, kind:"planet", body:p
    };
  }
  if (selRef.kind === "moon"){
    const p = S.planets[selRef.i];
    const m = p ? p.moonList[selRef.j] : null;
    if (!m) return null;
    const wp = orbitRate(MU_SUN, p.dist);
    const pMu = muOf("planet", p);
    return {
      x: m._x, y: m._y,
      vx: -Math.sin(p.ang)*wp*p.dist - Math.sin(m.ang)*m.w*m.orbR,
      vy:  Math.cos(p.ang)*wp*p.dist + Math.cos(m.ang)*m.w*m.orbR,
      mu: muOf("moon", m), bodyR: bodyROf(m),
      soi: soiOf("moon", m, m.orbR, pMu, m.orbR*0.84),
      key: keyOf(selRef), selRef, kind:"moon", body:m
    };
  }
  /* кометы и обломки: кинематические цели без гравитации */
  const pos = sys.posOf(selRef);
  const o = sys.obj(selRef);
  if (!pos || !o) return null;
  return { x:pos[0], y:pos[1], vx:0, vy:0, mu:0, bodyR: bodyROf(o), soi:0,
           key: keyOf(selRef), selRef, kind: selRef.kind, body:o };
}

/** Доминирующее гравитирующее тело в точке: звезда → планета → её луна. */
export function findPrimary(sys, gx, gy){
  const S = sys.S;
  let best = primaryState(sys, { kind:"star", i:0, j:0 });
  for(let i=0;i<S.planets.length;i++){
    const ps = primaryState(sys, { kind:"planet", i, j:0 });
    if (!ps) continue;
    if (Math.hypot(gx - ps.x, gy - ps.y) < ps.soi){
      best = ps;
      const p = S.planets[i];
      for(let j=0;j<p.moonList.length;j++){
        const ms = primaryState(sys, { kind:"moon", i, j });
        if (ms && Math.hypot(gx - ms.x, gy - ms.y) < ms.soi){ best = ms; break; }
      }
      break;
    }
  }
  return best;
}

/* ---------------- орбитальные элементы ---------------- */

/** Полный набор элементов из вектора состояния (плоская задача). */
export function elements(mu, rx, ry, rvx, rvy){
  const r = Math.hypot(rx, ry) || 1e-9;
  const v2 = rvx*rvx + rvy*rvy;
  const rdotv = rx*rvx + ry*rvy;
  const h = rx*rvy - ry*rvx;               // знак = направление обхода
  const En = v2/2 - mu/r;
  const p = mu > 0 ? h*h/mu : 0;
  /* вектор эксцентриситета */
  const ex = mu > 0 ? ((v2 - mu/r)*rx - rdotv*rvx)/mu : 0;
  const ey = mu > 0 ? ((v2 - mu/r)*ry - rdotv*rvy)/mu : 0;
  const e = Math.hypot(ex, ey);
  const a = Math.abs(En) > 1e-14 ? -mu/(2*En) : Infinity;
  const closed = En < 0 && isFinite(a);
  const rp = mu > 0 ? p/(1 + e) : r;
  const ra = closed ? p/(1 - e) : Infinity;
  const period = closed ? 2*Math.PI*Math.sqrt(a*a*a/mu) : Infinity;
  const s = h >= 0 ? 1 : -1;               // направление обхода
  const argp = Math.atan2(ey, ex);         // направление на перицентр
  /* истинная аномалия из r и r·v */
  const ecosnu = p/r - 1;
  const esinnu = rdotv*Math.sqrt(p/mu)/r * s;
  const nu = Math.atan2(esinnu, ecosnu);
  return { r, v: Math.sqrt(v2), E:En, e, a, rp, ra, period, h, p, s, argp, nu,
           mu, vr: rdotv/r };
}

/** Точка орбиты по истинной аномалии. */
export function pointAt(el, nu){
  const rr = el.p/(1 + el.e*Math.cos(nu));
  const th = el.argp + el.s*nu;
  return [rr*Math.cos(th), rr*Math.sin(th), rr];
}

/** Время от перицентра до истинной аномалии (для эллипса и гиперболы). */
export function timeFromPeri(el, nu){
  const { e, a, mu } = el;
  if (e < 1){
    const E = 2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2), Math.sqrt(1+e)*Math.cos(nu/2));
    const M = E - e*Math.sin(E);
    return M*Math.sqrt(a*a*a/mu);
  }
  const H = 2*Math.atanh(Math.sqrt((e-1)/(e+1))*Math.tan(nu/2));
  const M = e*Math.sinh(H) - H;
  return M*Math.sqrt(-a*-a*-a/mu);
}
/** Время до заданной истинной аномалии вперёд по движению. */
export function timeToNu(el, nuTarget){
  let dt = timeFromPeri(el, nuTarget) - timeFromPeri(el, el.nu);
  if (el.e < 1 && isFinite(el.period)){
    while (dt < 0) dt += el.period;
    while (dt > el.period) dt -= el.period;
  }
  return dt;
}
export const timeToApo  = el => el.e < 1 ? timeToNu(el, Math.PI) : Infinity;
export const timeToPeri = el => timeToNu(el, 0);

/* ---------------- кеплеровская пропагация ---------------- */

function stumpff(psi){
  if (psi > 1e-8){
    const s = Math.sqrt(psi);
    return [(1 - Math.cos(s))/psi, (s - Math.sin(s))/(psi*s)];
  }
  if (psi < -1e-8){
    const s = Math.sqrt(-psi);
    return [(1 - Math.cosh(s))/psi, (Math.sinh(s) - s)/((-psi)*s)];
  }
  return [0.5, 1/6];
}

/** Точное решение задачи двух тел через универсальную переменную.
 *  Работает для эллипса, параболы и гиперболы, при любом dt. */
export function propagate(mu, rx, ry, vx, vy, dt){
  if (!dt || mu <= 0) return { rx, ry, vx, vy };
  const r0 = Math.hypot(rx, ry);
  if (r0 < 1e-9) return { rx, ry, vx, vy };
  const v0sq = vx*vx + vy*vy;
  const alpha = 2/r0 - v0sq/mu;                 // 1/a
  const sqmu = Math.sqrt(mu);
  const rdotv = rx*vx + ry*vy;

  let T = dt;
  if (alpha > 1e-12){                            // эллипс: снимаем целые витки
    const a = 1/alpha;
    const period = 2*Math.PI*Math.sqrt(a*a*a/mu);
    if (isFinite(period) && period > 0) T = dt % period;
  }
  let chi;
  if (alpha > 1e-12) chi = sqmu*T*alpha;
  else if (alpha < -1e-12){
    const a = 1/alpha;
    const sg = Math.sign(T) || 1;
    const num = -2*mu*alpha*T;
    const den = rdotv + sg*Math.sqrt(-mu*a)*(1 - r0*alpha);
    chi = sg*Math.sqrt(-a)*Math.log(num/den);
    if (!isFinite(chi)) chi = sqmu*T*alpha;
  } else chi = sqmu*T/r0;

  let rNew = r0;
  for(let i=0;i<80;i++){
    const psi = chi*chi*alpha;
    const [c2, c3] = stumpff(psi);
    rNew = chi*chi*c2 + (rdotv/sqmu)*chi*(1 - psi*c3) + r0*(1 - psi*c2);
    if (Math.abs(rNew) < 1e-12) break;
    const F = (rdotv/sqmu)*chi*chi*c2 + (1 - alpha*r0)*chi*chi*chi*c3 + r0*chi - sqmu*T;
    const d = F/rNew;
    chi -= d;
    if (Math.abs(d) < 1e-11) break;
  }
  const psi = chi*chi*alpha;
  const [c2, c3] = stumpff(psi);
  const f = 1 - chi*chi*c2/r0;
  const g = T - chi*chi*chi*c3/sqmu;
  const nrx = f*rx + g*vx, nry = f*ry + g*vy;
  const rn = Math.hypot(nrx, nry) || 1e-9;
  const fd = sqmu/(r0*rn)*chi*(psi*c3 - 1);
  const gd = 1 - chi*chi*c2/rn;
  const out = { rx:nrx, ry:nry, vx: fd*rx + gd*vx, vy: fd*ry + gd*vy };
  if (!isFinite(out.rx) || !isFinite(out.vx)) return { rx, ry, vx, vy };
  return out;
}

/* ---------------- траектории для отрисовки ---------------- */

/** Точки коники в раме тела: настоящая орбита, а не интегрирование.
 *  Обрывается на границе SOI и на поверхности — там же, где реально
 *  закончится полёт. Возвращает { pts, exit } — exit описывает событие. */
export function conicPath(el, soi, bodyR, samples = 220){
  const pts = [];
  if (el.mu <= 0) return { pts, exit:null };
  const nuMax = el.e >= 1 ? Math.acos(-1/el.e)*0.999 : Math.PI;
  const span = el.e >= 1 ? (nuMax - el.nu) : 2*Math.PI;
  let exit = null;
  for(let i=0;i<=samples;i++){
    const nu = el.nu + span*(i/samples);
    if (el.e >= 1 && nu >= nuMax) break;
    const [x, y, rr] = pointAt(el, nu);
    if (rr > soi){ exit = { type:"soi", nu, dt: timeToNu(el, nu) }; break; }
    if (rr < bodyR){ exit = { type:"impact", nu, dt: timeToNu(el, nu) }; break; }
    pts.push([x, y]);
  }
  return { pts, exit };
}

/** Совместимость со старым вызовом: точки предсказанной траектории. */
export function predictPath(state, mu, soi, bodyR){
  const el = elements(mu, state.rx, state.ry, state.rvx, state.rvy);
  return conicPath(el, soi, bodyR).pts;
}
