import { mulberry32, hash2i } from "../core/rng.js";
import { nameFromHash } from "../core/naming.js";
import { primaryState, findPrimary, elements, propagate, bodyROf,
         surfaceG, conicPath, safeOrbitR, maxOrbitR, cleanOrbitR,
         maxCleanOrbitR } from "./physics.js";
import { Propulsion } from "./propulsion.js";
import { ManeuverNode, stateAfterNode, nodeDvVector, stateAtNode } from "./maneuver.js";
import { DU_M } from "./units.js";
import { AgentController, AGENT_PROFILES } from "./agents.js";
import { makeItem } from "./items.js";

export { bodyROf as bodyRadius } from "./physics.js";

/* Compact system-map silhouettes.  The hangar renderer is intentionally more
 * elaborate; these outlines stay legible from 4 to 40 screen pixels. */
const SYSTEM_HULLS={
  scout:[[0,-1],[-.42,.55],[0,.92],[.42,.55]],vesta:[[0,-1],[-.72,-.38],[-.55,.65],[0,1],[.55,.65],[.72,-.38]],
  hauler:[[-.62,-.86],[.62,-.86],[.92,.38],[.48,1],[-.48,1],[-.92,.38]],courier:[[0,-1],[-.34,.72],[0,1],[.34,.72]],
  interceptor:[[0,-1],[-1,.12],[-.35,.33],[-.52,1],[.52,1],[.35,.33],[1,.12]],miner:[[-.6,-.78],[.6,-.78],[.82,.5],[.4,1],[-.4,1],[-.82,.5]],
  explorer:[[0,-1],[-.62,-.2],[-.35,1],[.35,1],[.62,-.2]],gunship:[[0,-1],[-.95,-.12],[-.6,.25],[-.48,1],[.48,1],[.6,.25],[.95,-.12]],
  corvette:[[0,-1],[-.56,-.28],[-.38,1],[.38,1],[.56,-.28]],frigate:[[0,-1],[-.9,-.35],[-.7,.62],[0,1],[.7,.62],[.9,-.35]],
  freighter:[[-.7,-.8],[.7,-.8],[.82,.6],[.45,1],[-.45,1],[-.82,.6]],carrier:[[-1,-.75],[1,-.75],[1,.65],[.55,1],[-.55,1],[-1,.65]],
  dreadnought:[[0,-1],[-.9,-.48],[-1,.58],[-.62,1],[.62,1],[1,.58],[.9,-.48]]
};

/** Корабль. Три режима:
 *   newton — орбитальный полёт. Пока двигатель молчит, движение идёт «на
 *            рельсах» точным решением Кеплера: орбита не разрушается ни
 *            варпом, ни численной ошибкой. Двигатель включён — интегрируем.
 *   cruise — FSD-сверхкруиз внутри системы (Elite): гравитация отключена,
 *            выход ВСЕГДА на корректную круговую орбиту.
 *   landed — на поверхности. */
export class Ship {
  constructor(sys, col, startRel = 400){
    this.col = col;
    this.mode = "newton";
    this.primary = { kind:"star", i:0, j:0 };
    const ps = primaryState(sys, this.primary);
    const r = Math.max(startRel, (ps ? ps.bodyR : 20) + 40);
    this.rx = 0; this.ry = -r;
    const v = Math.sqrt((ps ? ps.mu : 0.3)/r);
    this.rvx = v; this.rvy = 0;
    this.nose = 0;
    this.turnRate = 1.2;
    this.ctrl = { left:false, right:false, thrust:false, retro:false };
    this.prop = new Propulsion();
    this.sas = "off";              // off | prograde | retrograde | radial | antiradial | node
    this.altitude = 20;            // целевая высота орбиты, du
    this.target = null;            // цель FSD
    this.cruiseV = 0;
    this.landedOn = null;
    this.manNode = null;
    this.nodeAuto = false;         // автопилот исполнения узла
    this.burning = false;
    this.lastStatus = "";
    this.integrity = this.prop.slots.hull.stats.hullInt;
  }

  /* ---------------- геометрия и элементы ---------------- */
  globPos(sys){
    const ps = primaryState(sys, this.primary);
    return ps ? [ps.x + this.rx, ps.y + this.ry] : [this.rx, this.ry];
  }
  globVel(sys){
    const ps = primaryState(sys, this.primary);
    return ps ? [ps.vx + this.rvx, ps.vy + this.rvy] : [this.rvx, this.rvy];
  }
  els(sys){
    const ps = primaryState(sys, this.primary);
    if (!ps || ps.mu <= 0) return null;
    return { ...elements(ps.mu, this.rx, this.ry, this.rvx, this.rvy), ps };
  }
  /** Высота над поверхностью текущего притягивающего тела. */
  alt(sys){
    const ps = primaryState(sys, this.primary);
    if (!ps) return 0;
    return Math.hypot(this.rx, this.ry) - ps.bodyR;
  }
  sameTarget(selRef){
    const t = this.mode === "cruise" ? this.target : this.primary;
    return !!(t && selRef && t.kind === selRef.kind && t.i === selRef.i && t.j === selRef.j);
  }

  /* ---------------- постановка на орбиту ---------------- */
  /** Круговая орбита вокруг тела на высоте h, в текущем направлении подхода. */
  setCircular(sys, selRef, h, bearing){
    const ps = primaryState(sys, selRef);
    if (!ps || ps.mu <= 0) return false;
    /* высота зажимается сферой влияния тела И сферами его спутников:
     * орбита, вылезающая за SOI, — траектория ухода, а орбита, задевающая
     * луну, уводит корабль к луне вместо цели */
    const r = cleanOrbitR(sys, selRef, h ?? this.altitude);
    const a = bearing !== undefined ? bearing : Math.atan2(this.ry, this.rx);
    this.mode = "newton";
    this.primary = { ...selRef };
    this.rx = Math.cos(a)*r; this.ry = Math.sin(a)*r;
    const v = Math.sqrt(ps.mu/r);
    this.rvx = -Math.sin(a)*v; this.rvy = Math.cos(a)*v;
    this.nose = a + Math.PI/2;
    this.landedOn = null;
    this.manNode = null; this.nodeAuto = false;
    return true;
  }
  /** Гарантированный выход на орбиту вокруг тела. */
  ensureOrbit(sys, selRef, h){
    if (!this.setCircular(sys, selRef, h)) return false;
    return this._verifyOrbit(sys, selRef);
  }

  /* ---------------- FSD ---------------- */
  fsdTo(selRef, h){
    if (h !== undefined) this.altitude = h;
    this.target = { ...selRef };
    this.mode = "cruise";
    this.cruiseV = Math.max(2, Math.hypot(this.rvx, this.rvy));
    this.manNode = null; this.nodeAuto = false;
  }
  orbitAt(selRef, h){ this.fsdTo(selRef, h); }
  flyTo(selRef, h){ this.fsdTo(selRef, h); }

  land(body){ this.mode = "landed"; this.landedOn = { ...body }; this.burning = false; }
  takeoff(sys, h){
    if (this.landedOn) this.setCircular(sys, this.landedOn, h ?? this.altitude);
    else this.mode = "newton";
  }

  /** Проверка захвата: если после выхода из FSD корабль почему-то
   *  оказался не в раме цели или орбита не помещается в SOI —
   *  переставляем на гарантированно безопасную круговую орбиту. */
  _verifyOrbit(sys, want){
    let shrink = 1;
    for(let attempt = 0; attempt < 5; attempt++){
      const [gx, gy] = this.globPos(sys);
      const best = findPrimary(sys, gx, gy);
      const ps = primaryState(sys, this.primary);
      if (!ps || ps.mu <= 0) return false;
      const el = elements(ps.mu, this.rx, this.ry, this.rvx, this.rvy);
      const inSoi = isFinite(el.ra) && el.ra < ps.soi*0.92;
      const clears = el.rp > ps.bodyR*1.05;
      const rightBody = !best || best.key === ps.key;
      if (inSoi && clears && rightBody) return true;

      /* Сначала пытаемся удержаться у ЗАПРОШЕННОГО тела, снижая орбиту:
       * чаще всего мешает сфера влияния близкой луны. Только если и это
       * не помогает — принимаем то тело, которое нас реально держит. */
      let target = want || this.primary;
      let psT = primaryState(sys, target);
      if (attempt >= 3 || !psT || psT.mu <= 0){
        if (!best) return false;
        target = best.selRef;
        psT = primaryState(sys, target);
        if (!psT || psT.mu <= 0) return false;
      }
      shrink *= 0.7;
      const room = maxCleanOrbitR(sys, target) - psT.bodyR;
      const alt = Math.max(psT.bodyR*0.14, Math.min(this.altitude, room)*shrink);
      this.setCircular(sys, target, alt, Math.atan2(this.ry, this.rx));
    }
    return false;
  }

  /* ---------------- манёвры ---------------- */
  setNode(eta, dvPro = 0, dvRad = 0){
    if (this.mode !== "newton") return;
    this.manNode = new ManeuverNode(Math.max(0, eta), dvPro, dvRad);
    this.nodeAuto = false;
  }
  nudgeNode(dPro, dRad, dEta){
    if (!this.manNode) return;
    this.manNode.dvPro += dPro || 0;
    this.manNode.dvRad += dRad || 0;
    this.manNode.eta = Math.max(0, this.manNode.eta + (dEta || 0));
  }
  cancelNode(){ this.manNode = null; this.nodeAuto = false; }
  /** Орбита после исполнения запланированного узла. */
  nodeOrbit(sys){
    if (!this.manNode) return null;
    const ps = primaryState(sys, this.primary);
    if (!ps || ps.mu <= 0) return null;
    const s = stateAfterNode(ps.mu, this, this.manNode);
    return { el: elements(ps.mu, s.rx, s.ry, s.vx, s.vy), ps };
  }
  /** Точка узла в раме тела (для маркера). */
  nodePoint(sys){
    if (!this.manNode) return null;
    const ps = primaryState(sys, this.primary);
    if (!ps || ps.mu <= 0) return null;
    const s = stateAtNode(ps.mu, this, this.manNode.eta);
    return [s.rx, s.ry];
  }
  /** Мгновенная циркуляризация оставлена только как сервисная команда
   *  (например, после аварии) — штатный путь теперь через узел. */
  circularize(sys){
    const ps = primaryState(sys, this.primary);
    if (!ps || ps.mu <= 0) return;
    const r = Math.hypot(this.rx, this.ry);
    const v = Math.sqrt(ps.mu/r);
    const tx = -this.ry/r, ty = this.rx/r;
    const dir = (this.rvx*tx + this.rvy*ty) >= 0 ? 1 : -1;
    this.rvx = tx*v*dir; this.rvy = ty*v*dir;
  }

  /* ---------------- ориентация ---------------- */
  _sasTarget(sys){
    const v = Math.hypot(this.rvx, this.rvy) || 1e-9;
    const r = Math.hypot(this.rx, this.ry) || 1e-9;
    switch(this.sas){
      case "prograde":   return Math.atan2(this.rvy, this.rvx);
      case "retrograde": return Math.atan2(-this.rvy, -this.rvx);
      case "radial":     return Math.atan2(this.ry, this.rx);
      case "antiradial": return Math.atan2(-this.ry, -this.rx);
      case "node": {
        if (!this.manNode) return null;
        const ps = primaryState(sys, this.primary);
        if (!ps) return null;
        const s = stateAtNode(ps.mu, this, Math.max(0, this.manNode.eta));
        const [dx, dy] = nodeDvVector(s, this.manNode);
        if (!dx && !dy) return null;
        return Math.atan2(dy, dx);
      }
      default: return null;
    }
  }
  _steer(dt, sys){
    if (this.ctrl.left) this.nose -= this.turnRate*dt;
    if (this.ctrl.right) this.nose += this.turnRate*dt;
    if (this.ctrl.left || this.ctrl.right) return;
    const want = this._sasTarget(sys);
    if (want === null) return;
    let da = want - this.nose;
    while(da > Math.PI) da -= 2*Math.PI;
    while(da < -Math.PI) da += 2*Math.PI;
    const step = this.turnRate*2.2*dt;
    this.nose += Math.abs(da) < step ? da : Math.sign(da)*step;
  }

  /* ---------------- основной шаг ---------------- */
  update(dt, sys){
    if (dt <= 0) return;
    this._system=sys;
    this.prop.tickWeapons(dt);
    this.prop.tickSystems(dt);
    const droid=this.prop.droid;
    if(droid)this.integrity=Math.min(this.prop.slots.hull.stats.hullInt,this.integrity+droid.stats.repair*Math.max(0,dt));
    if(this.empTimer>0){ this.empTimer=Math.max(0,this.empTimer-dt); this.burning=false; return; }
    if (this.mode === "landed"){
      const ps = primaryState(sys, this.landedOn || this.primary);
      if (ps){
        this.primary = ps.selRef;
        this.rx = 0; this.ry = ps.bodyR; this.rvx = 0; this.rvy = 0;
      }
      this.burning = false;
      return;
    }
    if (this.mode === "cruise"){ this._cruise(dt, sys); return; }
    this._orbital(dt, sys);
  }

  /** FSD-сверхкруиз: кинематический подлёт и КОРРЕКТНЫЙ выход на орбиту. */
  _cruise(dt, sys){
    const pos = sys.posOf(this.target);
    const o = sys.obj(this.target);
    if (!pos || !o){ this.mode = "newton"; return; }
    const [gx, gy] = this.globPos(sys);
    const dx = pos[0] - gx, dy = pos[1] - gy;
    const d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    let da = want - this.nose;
    while(da > Math.PI) da -= 2*Math.PI;
    while(da < -Math.PI) da += 2*Math.PI;
    this.nose += Math.max(-4*dt, Math.min(4*dt, da));

    const psT = primaryState(sys, this.target);
    const captureR = (psT && psT.mu > 0) ? cleanOrbitR(sys, this.target, this.altitude)
                                         : (psT ? psT.bodyR : 4) + 6;
    const ACC = 60, VMAX = 120;                 // du/с², du/с
    const brakeDist = this.cruiseV*this.cruiseV/(2*ACC);
    if (d > brakeDist + captureR*1.5) this.cruiseV = Math.min(VMAX, this.cruiseV + ACC*dt);
    else this.cruiseV = Math.max(1.5, this.cruiseV - ACC*dt);

    /* Движение дробится на подшаги короче окна захвата: при крупном кадре
     * (или варпе) корабль иначе перепрыгивал бы шар захвата целиком и
     * бесконечно нарезал круги вокруг цели. */
    const travel = this.cruiseV*dt;
    const sub = Math.max(1, Math.min(64, Math.ceil(travel/(captureR*0.35))));
    let nx = gx, ny = gy, dd = d;
    for(let k=0;k<sub;k++){
      nx += Math.cos(this.nose)*this.cruiseV*(dt/sub);
      ny += Math.sin(this.nose)*this.cruiseV*(dt/sub);
      dd = Math.hypot(pos[0] - nx, pos[1] - ny);
      if (dd <= captureR*1.25) break;
    }
    const anchor = (psT && psT.mu > 0) ? this.target : { kind:"star", i:0, j:0 };
    const ps = primaryState(sys, anchor);
    this.primary = { ...anchor };
    this.rx = nx - ps.x; this.ry = ny - ps.y;
    this.rvx = Math.cos(this.nose)*this.cruiseV;
    this.rvy = Math.sin(this.nose)*this.cruiseV;

    if (dd <= captureR*1.25){
      /* ГЛАВНОЕ ИСПРАВЛЕНИЕ: раньше корабль выходил из FSD со скоростью,
       * направленной НА тело (по носу) — это радиальная скорость, а такая
       * орбита неизбежно втыкается в поверхность. Теперь выход всегда
       * ставит корабль на круговую орбиту: скорость перпендикулярна
       * радиус-вектору и равна ровно круговой. */
      if (psT && psT.mu > 0){
        const bearing = Math.atan2(ny - pos[1], nx - pos[0]);
        this.setCircular(sys, this.target, this.altitude, bearing);
        /* Страховка: убеждаемся, что итоговая орбита действительно
         * принадлежит цели и целиком лежит внутри её сферы влияния. */
        this._verifyOrbit(sys, this.target);
        this.lastStatus = "выход из FSD: круговая орбита";
      } else {
        /* комета или обломок: гравитации нет — идём рядом, кинематически */
        this.mode = "newton";
        this.primary = { kind:"star", i:0, j:0 };
        const st = primaryState(sys, this.primary);
        this.rx = gx - st.x; this.ry = gy - st.y;
        this.rvx = 0; this.rvy = 0;
        this.lastStatus = "сближение завершено";
      }
      this.target = null;
      this.cruiseV = 0;
      sys.mgr?.onChange?.();
    }
  }

  /** Орбитальный полёт: коастинг по конике или интегрирование под тягой. */
  _orbital(dt, sys){
    this._steer(dt, sys);
    this._autoNode(dt, sys);

    const wantThrust = this.ctrl.thrust || this.ctrl.retro || this.prop.throttle > 0;
    const acc = this.prop.accel();
    this.burning = wantThrust && acc > 0 && this.prop.fuel > 0;

    if (this.burning) this._powered(dt, sys, acc);
    else this._coast(dt, sys);
  }

  /** Активный участок: интегрируем с подшагами (тяга ломает конику). */
  _powered(dt, sys, acc){
    const ps = primaryState(sys, this.primary);
    if (!ps || ps.mu <= 0) return;
    let ax = 0, ay = 0;
    if (this.ctrl.retro){
      const v = Math.hypot(this.rvx, this.rvy) || 1e-9;
      ax = -this.rvx/v*acc; ay = -this.rvy/v*acc;
    } else {
      ax = Math.cos(this.nose)*acc; ay = Math.sin(this.nose)*acc;
    }
    const r0 = Math.hypot(this.rx, this.ry);
    const vv = Math.hypot(this.rvx, this.rvy) || 1e-9;
    const n = Math.max(1, Math.min(64, Math.ceil(dt*vv/(r0*0.01))));
    const h = dt/n;
    for(let i=0;i<n;i++){
      const r = Math.hypot(this.rx, this.ry) || 1e-9;
      const g = -ps.mu/(r*r*r);
      /* leapfrog: скорость на полшага, потом позиция, потом добор */
      const axT = g*this.rx + ax, ayT = g*this.ry + ay;
      this.rvx += axT*h*0.5; this.rvy += ayT*h*0.5;
      this.rx += this.rvx*h;  this.ry += this.rvy*h;
      const r2 = Math.hypot(this.rx, this.ry) || 1e-9;
      const g2 = -ps.mu/(r2*r2*r2);
      this.rvx += (g2*this.rx + ax)*h*0.5;
      this.rvy += (g2*this.ry + ay)*h*0.5;
    }
    this.prop.consume(dt);
    this._afterStep(sys, ps);
  }

  /** Коастинг: точная коника + поиск событий (SOI, поверхность). */
  _coast(dt, sys){
    let remain = dt, guard = 0;
    while (remain > 1e-9 && guard++ < 16){
      const ps = primaryState(sys, this.primary);
      if (!ps || ps.mu <= 0){ this.primary = { kind:"star", i:0, j:0 }; break; }
      const el = elements(ps.mu, this.rx, this.ry, this.rvx, this.rvy);
      /* шаг не длиннее 1/24 витка — чтобы не проскочить SOI или поверхность */
      const lim = isFinite(el.period) ? Math.max(el.period/24, 1e-3) : remain;
      const step = Math.min(remain, lim);
      const s = propagate(ps.mu, this.rx, this.ry, this.rvx, this.rvy, step);
      this.rx = s.rx; this.ry = s.ry; this.rvx = s.vx; this.rvy = s.vy;
      remain -= step;
      if (this._afterStep(sys, ps)) continue;
    }
  }

  /** События после шага: касание поверхности и смена сферы влияния. */
  _afterStep(sys, ps){
    const r = Math.hypot(this.rx, this.ry);
    if (r < ps.bodyR){
      /* Никаких отскоков (старый «отскок» добавлял энергию и выбрасывал
       * корабль). Касание = посадка: гасим скорость и садимся. */
      const a = Math.atan2(this.ry, this.rx);
      this.rx = Math.cos(a)*ps.bodyR; this.ry = Math.sin(a)*ps.bodyR;
      this.rvx = 0; this.rvy = 0;
      this.mode = "landed";
      this.landedOn = { ...this.primary };
      this.lastStatus = "касание поверхности";
      sys.mgr?.onChange?.();
      return false;
    }
    const gx = ps.x + this.rx, gy = ps.y + this.ry;
    const best = findPrimary(sys, gx, gy);
    if (best && best.key !== ps.key){
      const gvx = ps.vx + this.rvx, gvy = ps.vy + this.rvy;
      this.primary = { ...best.selRef };
      this.rx = gx - best.x; this.ry = gy - best.y;
      this.rvx = gvx - best.vx; this.rvy = gvy - best.vy;
      this.manNode = null; this.nodeAuto = false;
      this.lastStatus = "смена сферы влияния";
      sys.mgr?.onChange?.();
      return true;
    }
    return false;
  }

  /** Автопилот исполнения узла: доворот, старт за полпрожига до узла,
   *  выключение по набранной Δv — как «execute node» в KSP. */
  _autoNode(dt, sys){
    const n = this.manNode;
    if (!n) return;
    n.eta -= dt;
    if (!this.nodeAuto){
      if (n.eta < -30) this.cancelNode();
      return;
    }
    const need = n.dv - (n.done || 0);
    if (need <= 0.5){
      this.prop.throttle = 0;
      this.ctrl.thrust = false;
      this.cancelNode();
      this.sas = "prograde";
      this.lastStatus = "манёвр выполнен";
      sys.mgr?.onChange?.();
      return;
    }
    this.sas = "node";
    const halfBurn = this.prop.burnTime(need)/2;
    if (n.eta <= halfBurn){
      this.ctrl.thrust = true;
      const soft = Math.min(1, need/Math.max(1e-6, this.prop.accelFullMs*1.5));
      this.prop.throttle = Math.max(0.05, soft);
      const dv = this.prop.accel()*DU_M*dt;
      n.done = (n.done || 0) + dv;
      n.executing = true;
    } else {
      this.ctrl.thrust = false;
      this.prop.throttle = 0;
    }
  }
  /** Запустить исполнение запланированного узла. */
  executeNode(){
    if (!this.manNode) return;
    this.manNode.done = 0;
    this.nodeAuto = true;
    this.sas = "node";
  }

  /* ---------------- отрисовка ---------------- */
  draw(sctx, X, Y, t, zoom=0){
    const sprite=this.prop.hullStats.hullSprite||"vesta";
    const size=Math.max(3,Math.min(22,Math.round(3+zoom*10)));
    if(size>=6){
      const c=Math.cos(this.nose),s=Math.sin(this.nose),shape=SYSTEM_HULLS[sprite]||SYSTEM_HULLS.vesta;
      const point=([x,y])=>[Math.round(X+(x*c-y*s)*size),Math.round(Y+(x*s+y*c)*size)];
      const first=point(shape[0]);sctx.beginPath();sctx.moveTo(first[0],first[1]);
      for(const v of shape.slice(1)){const q=point(v);sctx.lineTo(q[0],q[1]);}
      sctx.closePath();sctx.fillStyle=this.col;sctx.fill();
      sctx.strokeStyle="#172440";sctx.lineWidth=1;sctx.stroke();
      const cockpit=point([0,-.38]);sctx.fillStyle="#bdeaff";sctx.fillRect(cockpit[0]-1,cockpit[1]-1,3,3);
      const armed=this.prop.weapons.length>0;
      if(armed&&size>=10){for(const wing of [-.48,.48]){const gun=point([wing,.12]);sctx.fillStyle="#ffca70";sctx.fillRect(gun[0]-1,gun[1]-1,3,3);}}
      if(this.prop.shield&&size>=14){sctx.strokeStyle="rgba(143,208,255,.65)";sctx.beginPath();sctx.arc(Math.round(X),Math.round(Y),size+3,0,Math.PI*2);sctx.stroke();}
    }
    const c = Math.cos(this.nose), s = Math.sin(this.nose);
    if(size>=6){
      const fire=this.mode === "cruise"||this.burning;
      if(fire&&Math.floor(t*12)%2){sctx.fillStyle=this.mode==="cruise"?"#8fd0ff":"#ffd166";sctx.fillRect(Math.round(X-c*(size+3))-1,Math.round(Y-s*(size+3))-1,3,3);}
      return;
    }
    sctx.fillStyle = this.col;
    sctx.fillRect(Math.round(X + c*3)-1, Math.round(Y + s*3)-1, 2, 2);
    sctx.fillRect(Math.round(X)-1, Math.round(Y)-1, 2, 2);
    sctx.fillRect(Math.round(X - c*2 - s*2), Math.round(Y - s*2 + c*2), 1, 1);
    sctx.fillRect(Math.round(X - c*2 + s*2), Math.round(Y - s*2 - c*2), 1, 1);
    const fire = this.mode === "cruise" || this.burning;
    if (fire && Math.floor(t*12) % 2){
      sctx.fillStyle = this.mode === "cruise" ? "#8fd0ff" : "#ffd166";
      sctx.fillRect(Math.round(X - c*4), Math.round(Y - s*4), 1, 1);
      if (this.mode === "cruise") sctx.fillRect(Math.round(X - c*6), Math.round(Y - s*6), 1, 1);
    }
  }
}

/** NPC: летает на FSD между телами и стоит на орбитах. */
export class Npc {
  constructor(ship, name, profile="trader", agentConfig={}, seed=1){
    this.ship = ship;
    this.name = name;
    this.agent = new AgentController(profile,agentConfig,seed);
    ship._npc = this;
    this.role=this.agent.config.role;
  }
  update(dt, sys){
    this.ship.update(dt, sys);
    this.agent.update(this,dt,sys);
  }
}

export function makeNpcs(sys, seed,agentConfig={}){
  const S = sys.S;
  if (S.bhOnly || !S.planets.length) return [];
  const rng = mulberry32(seed ^ 0x0c9c);
  const n = 1 + Math.floor(rng()*2);
  const npcs = [];
  const PROFILES=["trader","patrol","geologist","courier","ranger","pirate"];
  for(let i=0;i<n;i++){
    const pi = Math.floor(rng()*S.planets.length);
    const ship = new Ship(sys, "#6fb7ff", 300 + rng()*250);
    ship.fsdTo({ kind:"planet", i:pi, j:0 }, 16);
    const profile=PROFILES[Math.floor(rng()*PROFILES.length)];
    const hullByProfile={trader:"hull_hauler",patrol:"hull_gunship",geologist:"hull_miner",courier:"hull_courier",ranger:"hull_explorer",pirate:"hull_interceptor"};
    ship.prop.install(makeItem(hullByProfile[profile]||"hull_std"));
    ship.integrity=ship.prop.slots.hull.stats.hullInt;
    ship.prop.install(makeItem(profile==="pirate" ? "wpn_missile" : profile==="patrol"||profile==="ranger" ? "wpn_energy" : "wpn_laser"));
    if(ship.prop.slotAvailable("shield"))ship.prop.install(makeItem(profile==="pirate" ? "shield_m" : "shield_s"));
    npcs.push(new Npc(ship,
      (AGENT_PROFILES[profile].role||profile) + " «" + nameFromHash(hash2i(i, 71, seed)) + "»",
      profile,agentConfig[profile]||agentConfig.default||{},seed+i*7919));
  }
  return npcs;
}
