/** Патч-коники в духе KSP: у каждого тела гравпараметр μ и сфера влияния (SOI).
 *  Корабль интегрируется в системе отсчёта доминирующего тела; при пересечении
 *  границы SOI состояние конвертируется в раму нового тела.
 *
 *  Ключевая калибровка: генератор двигает планеты с ω = 200/d^1.5,
 *  т.е. v²·d = 40000 — планеты УЖЕ на кеплеровых орбитах с MU_SUN = 40000. */
export const MU_SUN = 40000;

export function muOf(kind, o){
  if (kind === "star") return MU_SUN;
  return 3.4 * (o.size || 4) * (o.size || 4);   // планеты и луны: μ ∝ size²
}
export function bodyROf(o){ return o && o.size ? o.size/2 : 4; }

/** SOI: r_soi = dist · (μ/μ_родителя)^0.4 (классическая ^(2/5)). */
export function soiOf(kind, o, parentDist, parentMu){
  if (kind === "star") return 1e9;
  const mu = muOf(kind, o);
  return Math.max(bodyROf(o) + 10, parentDist * Math.pow(mu/parentMu, 0.4));
}

const keyOf = s => s.kind + ":" + s.i + ":" + s.j;

/** Позиция/скорость/параметры тела selRef в глобальной раме системы. */
export function primaryState(sys, selRef){
  const S = sys.S;
  if (selRef.kind === "star"){
    return { x:0, y:0, vx:0, vy:0, mu:MU_SUN, bodyR: S.sun.D/2, soi:1e9,
             key:keyOf(selRef), selRef };
  }
  if (selRef.kind === "planet"){
    const p = S.planets[selRef.i];
    if (!p) return null;
    const w = 200/Math.pow(p.dist, 1.5);
    return {
      x: p._x, y: p._y,
      vx: -Math.sin(p.ang)*w*p.dist, vy: Math.cos(p.ang)*w*p.dist,
      mu: muOf("planet", p), bodyR: bodyROf(p),
      soi: soiOf("planet", p, p.dist, MU_SUN),
      key: keyOf(selRef), selRef
    };
  }
  if (selRef.kind === "moon"){
    const p = S.planets[selRef.i];
    const m = p ? p.moonList[selRef.j] : null;
    if (!m) return null;
    const wp = 200/Math.pow(p.dist, 1.5);
    const pMu = muOf("planet", p);
    return {
      x: m._x, y: m._y,
      vx: -Math.sin(p.ang)*wp*p.dist - Math.sin(m.ang)*m.w*m.orbR,
      vy:  Math.cos(p.ang)*wp*p.dist + Math.cos(m.ang)*m.w*m.orbR,
      mu: muOf("moon", m), bodyR: bodyROf(m),
      soi: soiOf("moon", m, m.orbR, pMu),
      key: keyOf(selRef), selRef
    };
  }
  /* кометы/обломки: масса пренебрежима — их «SOI» условная, только для стыковки */
  const pos = sys.posOf(selRef);
  if (!pos) return null;
  return { x:pos[0], y:pos[1], vx:0, vy:0, mu: 30, bodyR: bodyROf(sys.obj(selRef)),
           soi: 26, key: keyOf(selRef), selRef };
}

/** Доминирующее тело для глобальной точки: солнце → планета → её луна. */
export function findPrimary(sys, gx, gy){
  const S = sys.S;
  let best = primaryState(sys, { kind:"star", i:0, j:0 });
  for(let i=0;i<S.planets.length;i++){
    const p = S.planets[i];
    const ps = primaryState(sys, { kind:"planet", i, j:0 });
    if (Math.hypot(gx - ps.x, gy - ps.y) < ps.soi){
      best = ps;
      for(let j=0;j<p.moonList.length;j++){
        const ms = primaryState(sys, { kind:"moon", i, j });
        if (Math.hypot(gx - ms.x, gy - ms.y) < ms.soi){ best = ms; break; }
      }
      break;
    }
  }
  return best;
}

/** Орбитальные элементы из относительных координат (2D). */
export function elements(mu, rx, ry, rvx, rvy){
  const r = Math.hypot(rx, ry);
  const v2 = rvx*rvx + rvy*rvy;
  const E = v2/2 - mu/r;
  const h = rx*rvy - ry*rvx;
  const e = Math.sqrt(Math.max(0, 1 + 2*E*h*h/(mu*mu)));
  const a = E < 0 ? -mu/(2*E) : Infinity;
  const rp = E < 0 ? a*(1 - e) : (h*h/mu)/(1 + e);
  const ra = E < 0 ? a*(1 + e) : Infinity;
  const period = E < 0 ? 2*Math.PI*Math.sqrt(a*a*a/mu) : Infinity;
  return { r, v: Math.sqrt(v2), E, e, a, rp, ra, period, h };
}

/** Предсказание траектории в раме текущего primary (как рисует KSP):
 *  интегрируем копию состояния, обрываем на границе SOI или при столкновении. */
export function predictPath(state, mu, soi, bodyR, steps = 460, pdt = 0.07){
  let { rx, ry, rvx, rvy } = state;
  const pts = [];
  for(let i=0;i<steps;i++){
    const r = Math.hypot(rx, ry);
    if (r > soi*1.05 || r > 480) break;
    if (r < bodyR) break;
    const a = -mu/(r*r*r);
    rvx += a*rx*pdt; rvy += a*ry*pdt;
    rx += rvx*pdt; ry += rvy*pdt;
    if (i % 3 === 0) pts.push([rx, ry]);
  }
  return pts;
}
