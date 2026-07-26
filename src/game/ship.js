import { mulberry32, hash2i } from "../core/rng.js";
import { nameFromHash } from "../core/naming.js";
import { primaryState, findPrimary, elements } from "./physics.js";

export { bodyROf as bodyRadius } from "./physics.js";

/** Корабль с тремя режимами движения:
 *  - "newton": свободный полёт в раме доминирующего тела (патч-коники),
 *    ручная тяга (нос/prograde/retrograde);
 *  - "cruise": FSD-сверхускорение внутри системы (гравитация отключена,
 *    скорость растёт, автоторможение и автоциркуляризация у цели);
 *  - "landed": на поверхности (гипер между звёзд живёт уровнем выше). */
export class Ship {
  constructor(sys, col, startRel = 186){
    this.col = col;
    this.mode = "newton";
    this.primary = { kind:"star", i:0, j:0 };
    this.rx = 0; this.ry = -startRel;
    /* круговая орбита вокруг звезды по умолчанию */
    const ps = primaryState(sys, this.primary);
    const v = Math.sqrt(ps.mu/startRel);
    this.rvx = v; this.rvy = 0;
    this.nose = 0;
    this.ctrl = { left:false, right:false, thrust:false, retro:false };
    this.thrustAcc = 26;
    this.turnRate = 3;
    this.altitude = 14;
    this.target = null;       // цель FSD
    this.cruiseV = 0;
    this.landedOn = null;
  }
  key(s){ return s.kind + ":" + s.i + ":" + s.j; }
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
    return ps ? { ...elements(ps.mu, this.rx, this.ry, this.rvx, this.rvy), ps } : null;
  }
  /** Мгновенно поставить на круговую орбиту (используется FSD-выходом и взлётом). */
  setCircular(sys, selRef, h){
    const ps = primaryState(sys, selRef);
    if (!ps) return;
    this.mode = "newton";
    this.primary = { ...selRef };
    const r = ps.bodyR + (h ?? this.altitude);
    const a = Math.random()*Math.PI*2;
    this.rx = Math.cos(a)*r; this.ry = Math.sin(a)*r;
    const v = Math.sqrt(ps.mu/r);
    this.rvx = -Math.sin(a)*v; this.rvy = Math.cos(a)*v;
    this.nose = a + Math.PI/2;
    this.landedOn = null;
  }
  /** FSD: сверхкруиз к любому телу системы. */
  fsdTo(selRef, h){
    if (h !== undefined) this.altitude = h;
    this.target = { ...selRef };
    this.mode = "cruise";
    this.cruiseV = Math.max(30, Math.hypot(this.rvx, this.rvy));
  }
  orbitAt(selRef, h){ this.fsdTo(selRef, h); }
  flyTo(selRef, h){ this.fsdTo(selRef, h); }
  sameTarget(selRef){
    const t = this.mode === "cruise" ? this.target : this.primary;
    return t && selRef && t.kind === selRef.kind && t.i === selRef.i && t.j === selRef.j;
  }
  land(body){
    this.mode = "landed";
    this.landedOn = { ...body };
  }
  takeoff(sys, h){
    if (this.landedOn) this.setCircular(sys, this.landedOn, h ?? this.altitude);
    else this.mode = "newton";
  }
  update(dt, sys){
    if (this.mode === "landed"){
      /* стоим на поверхности: следуем за телом */
      const ps = primaryState(sys, this.landedOn || this.primary);
      if (ps){ this.primary = ps.selRef; this.rx = 0; this.ry = ps.bodyR; this.rvx = 0; this.rvy = 0; }
      return;
    }
    if (this.mode === "cruise"){
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
      /* разгон / торможение: тормозной путь v²/(2·b).
       *  b повышено для малых тел — иначе торможение не успевает. */
      const psT = primaryState(sys, this.target);
      const captureR = (psT ? psT.bodyR : 4) + this.altitude;
      const brakeAcc = Math.max(260, (psT ? psT.mu / Math.max(10, captureR) : 260));
      const brake = this.cruiseV*this.cruiseV/(2*brakeAcc);
      if (d > brake + 20) this.cruiseV = Math.min(420, this.cruiseV + 300*dt);
      else this.cruiseV = Math.max(12, this.cruiseV - 300*dt);
      const nx = gx + Math.cos(this.nose)*this.cruiseV*dt;
      const ny = gy + Math.sin(this.nose)*this.cruiseV*dt;
      /* состояние храним в раме будущего primary (цели, если она гравитирует) */
      const anchor = ["planet","moon","star"].includes(this.target.kind)
        ? this.target : { kind:"star", i:0, j:0 };
      const ps = primaryState(sys, anchor);
      this.primary = { ...anchor };
      this.rx = nx - ps.x; this.ry = ny - ps.y;
      this.rvx = Math.cos(this.nose)*this.cruiseV - ps.vx;
      this.rvy = Math.sin(this.nose)*this.cruiseV - ps.vy;
      if (d < captureR + 8){
        /* Выход из FSD: обрезаем скорость до 90% круговой на целевой высоте —
         * корабль выйдет на эллиптическую орбиту без столкновения. */
        if (psT && psT.mu > 0){
          const vCirc = Math.sqrt(psT.mu / captureR);
          if (this.cruiseV > vCirc * 0.9){
            this.cruiseV = vCirc * 0.9;
            // пересчитываем rvx/rvy с новой скоростью
            this.rvx = Math.cos(this.nose)*this.cruiseV - ps.vx;
            this.rvy = Math.sin(this.nose)*this.cruiseV - ps.vy;
          }
        }
        this.mode = "newton";
        this.target = null;
        sys.mgr?.onChange?.();
      }
      return;
    }
    /* --- newton: патч-коники + ручная тяга --- */
    if (this.ctrl.left) this.nose -= this.turnRate*dt;
    if (this.ctrl.right) this.nose += this.turnRate*dt;
    let ax = 0, ay = 0;
    if (this.ctrl.thrust){
      ax += Math.cos(this.nose)*this.thrustAcc;
      ay += Math.sin(this.nose)*this.thrustAcc;
    }
    if (this.ctrl.retro){
      const v = Math.hypot(this.rvx, this.rvy);
      if (v > 0.5){ ax -= this.rvx/v*this.thrustAcc; ay -= this.rvy/v*this.thrustAcc; }
    }
    const ps = primaryState(sys, this.primary);
    if (!ps){ this.primary = { kind:"star", i:0, j:0 }; return; }
    const SUB = 4, h = dt/SUB;
    for(let s=0; s<SUB; s++){
      const r = Math.hypot(this.rx, this.ry);
      const g = -ps.mu/(r*r*r);
      this.rvx += (g*this.rx + ax)*h;
      this.rvy += (g*this.ry + ay)*h;
      this.rx += this.rvx*h;
      this.ry += this.rvy*h;
    }
    /* столкновение с поверхностью → мягкая посадка/отскок на низкой скорости */
    const r = Math.hypot(this.rx, this.ry);
    if (r < ps.bodyR + 1){
      const nx = this.rx/r, ny = this.ry/r;
      this.rx = nx*(ps.bodyR + 1); this.ry = ny*(ps.bodyR + 1);
      const vn = this.rvx*nx + this.rvy*ny;
      if (vn < 0){ this.rvx -= vn*nx*1.4; this.rvy -= vn*ny*1.4; }
    }
    /* смена сферы влияния */
    const gx = ps.x + this.rx, gy = ps.y + this.ry;
    const docked = this.primary.kind === "comet" || this.primary.kind === "rock";
    if (docked){
      /* у малых тел «SOI» условная: держимся рядом, пока не улетели */
      if (r > ps.soi*1.3){
        const best = findPrimary(sys, gx, gy);
        this.primary = { ...best.selRef };
        this.rx = gx - best.x; this.ry = gy - best.y;
        this.rvx = this.rvx - best.vx; this.rvy = this.rvy - best.vy;
        sys.mgr?.onChange?.();
      }
    } else {
      const best = findPrimary(sys, gx, gy);
      if (best && best.key !== ps.key){
        const gvx = ps.vx + this.rvx, gvy = ps.vy + this.rvy;
        this.primary = { ...best.selRef };
        this.rx = gx - best.x; this.ry = gy - best.y;
        this.rvx = gvx - best.vx; this.rvy = gvy - best.vy;
        sys.mgr?.onChange?.();
      }
    }
  }
  /** Циркуляризация в текущей точке (сервоманёвр). */
  circularize(sys){
    const ps = primaryState(sys, this.primary);
    if (!ps) return;
    const r = Math.hypot(this.rx, this.ry);
    const v = Math.sqrt(ps.mu/r);
    const tx = -this.ry/r, ty = this.rx/r;
    const dir = (this.rvx*tx + this.rvy*ty) >= 0 ? 1 : -1;
    this.rvx = tx*v*dir; this.rvy = ty*v*dir;
  }
  /** Манёвровый узел: планирование delta-v в заданной точке орбиты.
   *  @param {number} dvProg — prograde delta-v
   *  @param {number} dvRad — radial-out delta-v (положительное: от тела)
   *  @param {number} [eta=20] — время до узла (сек), по умолчанию 20 */
  setManeuverNode(dvProg, dvRad, eta = 20){
    if (this.mode !== "newton") return;
    this.manNode = {
      dvProg, dvRad,
      eta,             // время до исполнения
      timer: eta,      // убывающий таймер
      rx: this.rx, ry: this.ry  // позиция узла в текущей раме (для визуализации)
    };
  }
  /** Применяет манёвровый узел, когда таймер истекает. */
  _executeNode(sys){
    const n = this.manNode;
    if (!n) return;
    n.timer -= 1/60;                               // ~16ms кадр
    if (n.timer <= 0){
      const r = Math.hypot(this.rx, this.ry);
      const tx = -this.ry/r, ty = this.rx/r;       // prograde
      const rx = this.rx/r, ry = this.ry/r;        // radial-out
      this.rvx += tx*n.dvProg + rx*n.dvRad;
      this.rvy += ty*n.dvProg + ry*n.dvRad;
      this.manNode = null;
      sys.mgr?.onChange?.();
    }
  }
  /** Отменить манёвровый узел. */
  cancelNode(){ this.manNode = null; }
  /** Гомановский переход между круговыми орбитами вокруг текущего primary.
   *  Первый импульс (prograde) — сейчас, второй запоминается в hohPhase. */
  hohmannTo(sys, targetAlt){
    if (this.mode !== "newton") return;
    const ps = primaryState(sys, this.primary);
    if (!ps) return;
    const r1 = Math.hypot(this.rx, this.ry);
    const r2 = ps.bodyR + targetAlt;
    if (Math.abs(r1 - r2) < 2) return;   // уже там
    const mu = ps.mu;
    const a = (r1 + r2)/2;               // большая полуось переходной орбиты
    const v1 = Math.sqrt(mu/r1);         // текущая круговая скорость
    const vTransfer = Math.sqrt(2*mu/r1 - mu/a);
    const dv = r1 < r2 ? vTransfer - v1 : -(v1 - vTransfer);
    // prograde импульс
    const tx = -this.ry/r1, ty = this.rx/r1;
    this.rvx += tx*dv; this.rvy += ty*dv;
    this.hohPhase = { r2, a };
    sys.mgr?.onChange?.();
  }
  /** Проверка и выполнение второго импульса гомановского перехода. */
  _checkHohmann(sys){
    if (!this.hohPhase) return;
    const ps = primaryState(sys, this.primary);
    if (!ps){ this.hohPhase = null; return; }
    const r = Math.hypot(this.rx, this.ry);
    if (Math.abs(r - this.hohPhase.r2) < 3){
      // циркуляризуемся на целевой высоте
      const v = Math.sqrt(ps.mu/r);
      const tx = -this.ry/r, ty = this.rx/r;
      const dir = (this.rvx*tx + this.rvy*ty) >= 0 ? 1 : -1;
      this.rvx = tx*v*dir; this.rvy = ty*v*dir;
      this.hohPhase = null;
      sys.mgr?.onChange?.();
    }
  }
  draw(sctx, X, Y, t){
    const c = Math.cos(this.nose), s = Math.sin(this.nose);
    sctx.fillStyle = this.col;
    sctx.fillRect(Math.round(X + c*3)-1, Math.round(Y + s*3)-1, 2, 2);
    sctx.fillRect(Math.round(X)-1, Math.round(Y)-1, 2, 2);
    sctx.fillRect(Math.round(X - c*2 - s*2), Math.round(Y - s*2 + c*2), 1, 1);
    sctx.fillRect(Math.round(X - c*2 + s*2), Math.round(Y - s*2 - c*2), 1, 1);
    const burning = this.mode === "cruise" || this.ctrl.thrust || this.ctrl.retro;
    if (burning && Math.floor(t*12) % 2){
      sctx.fillStyle = this.mode === "cruise" ? "#8fd0ff" : "#ffd166";
      sctx.fillRect(Math.round(X - c*4), Math.round(Y - s*4), 1, 1);
      if (this.mode === "cruise") sctx.fillRect(Math.round(X - c*6), Math.round(Y - s*6), 1, 1);
    }
  }
}

/** NPC: использует FSD-круиз для перемещения между телами, автоматически
 *  выходит на орбиту при подлёте и ждёт на орбите заданное время. */
export class Npc {
  constructor(ship, name){
    this.ship = ship;
    this.name = name;
    this.timer = 2 + Math.random()*4;
  }
  /** Случайная планета или спутник в системе (исключая газовые гиганты
   *  для разнообразия — на них нельзя сесть, но можно покружить). */
  pickTarget(sys){
    const S = sys.S;
    const cands = [];
    for(let i=0;i<S.planets.length;i++){
      cands.push({ kind:"planet", i, j:0 });
      const p = S.planets[i];
      for(let j=0;j<p.moonList.length;j++){
        cands.push({ kind:"moon", i, j });
      }
    }
    if (!cands.length) return null;
    return cands[Math.floor(Math.random()*cands.length)];
  }
  update(dt, sys){
    this.ship.update(dt, sys);
    if (this.ship.mode === "cruise") return;   // ждём завершения FSD-перелёта
    this.timer -= dt;
    if (this.timer <= 0){
      const target = this.pickTarget(sys);
      if (target){
        this.ship.fsdTo(target, 10 + Math.random()*12);
        this.timer = 20 + Math.random()*25;    // держимся на орбите 20–45 сек
      }
    }
  }
}

export function makeNpcs(sys, seed){
  const S = sys.S;
  if (S.bhOnly || !S.planets.length) return [];
  const rng = mulberry32(seed ^ 0x0c9c);
  const n = 1 + Math.floor(rng()*2);
  const npcs = [];
  const ROLES = ["Торговец", "Патруль", "Геолог", "Курьер"];
  for(let i=0;i<n;i++){
    const pi = Math.floor(rng()*S.planets.length);
    const ship = new Ship(sys, "#6fb7ff", 120 + rng()*80);
    ship.fsdTo({ kind:"planet", i:pi, j:0 }, 12);
    npcs.push(new Npc(ship,
      ROLES[Math.floor(rng()*ROLES.length)] + " «" + nameFromHash(hash2i(i, 71, seed)) + "»"));
  }
  return npcs;
}
