import { buildSystem, stepSystem, lightAt, LETTERS, ROM } from "../gen/system.js";
import { renderPlanetBody } from "../gen/planet.js";
import { renderStar } from "../gen/star.js";
import { renderBH } from "../gen/blackhole.js";
import { CLS } from "../gen/starclass.js";
import { PT_RU } from "../gen/planet.js";
import { BodyScene } from "./body.js";
import { lblText, toLbl } from "../ui/panel.js";
import { bakeSystemNebula, NEB_SPAN } from "../gen/nebula.js";
import { LandingScene } from "./landing.js";
import { Ship, makeNpcs } from "../game/ship.js";
import { primaryState, predictPath, muOf, soiOf, MU_SUN } from "../game/physics.js";
import { player } from "../game/player.js";
import { planetStats, smallBodyStats, statsTooltipHTML, starTooltipHTML } from "../game/stats.js";

export class SystemScene {
  constructor(galaxy, star){
    this.g = galaxy;
    this.star = star;
    this.crumb = "Система";
    this.S = buildSystem(galaxy, star);
    this.sel = this.S.planets.length ? { kind:"planet", i:0, j:0 } : null;
    this.cam = { x:0, y:0 };
    this.follow = false;
    this.orbitAlt = 14;
    this.nebCvs = this.S.neb ? bakeSystemNebula(this.S.neb) : null;
    /* корабли */
    this.playerShip = this.S.bhOnly ? null : new Ship(this, "#ffd166");
    this.npcs = makeNpcs(this, galaxy.systemSeedOf ? galaxy.systemSeedOf(star) : 1);
    this.followShip = false;
    this.zoom = 1;
  }
  fit(){ this.cam.x = 0; this.cam.y = 0; this.zoom = 1; }
  ssx(w){ return (w - this.cam.x)*this.zoom + this.ctx.SCR/2; }
  ssy(w){ return (w - this.cam.y)*this.zoom + this.ctx.SCR/2; }
  zoomBy(f){ this.zoom = Math.min(4, Math.max(0.15, this.zoom*f)); }
  onWheel(mx, my, deltaY){
    const wx = (mx - this.ctx.SCR/2)/this.zoom + this.cam.x;
    const wy = (my - this.ctx.SCR/2)/this.zoom + this.cam.y;
    this.zoom = Math.min(4, Math.max(0.15, this.zoom * (deltaY < 0 ? 1.18 : 1/1.18)));
    this.cam.x = wx - (mx - this.ctx.SCR/2)/this.zoom;
    this.cam.y = wy - (my - this.ctx.SCR/2)/this.zoom;
  }
  /** Управление с клавиатуры (e.code): газ/тормоз/поворот, манёвры. */
  onKey(code, down){
    const sh = this.playerShip;
    if (!sh || sh.mode === "landed") return;
    if (code === "KeyA") sh.ctrl.left = down;
    else if (code === "KeyD") sh.ctrl.right = down;
    else if (code === "KeyW") sh.ctrl.thrust = down;
    else if (code === "KeyS") sh.ctrl.retro = down;
    else if (down && code === "KeyX"){ sh.ctrl.thrust = sh.ctrl.retro = false; }
    else if (down && code === "KeyC" && sh.mode === "newton") sh.circularize(this);
    else if (down && code === "KeyF" && this.sel) sh.fsdTo(this.sel, this.orbitAlt);
  }
  /** Характеристики любого выбираемого тела (для карточки и тултипа). */
  statsOf(sel){
    const o = this.obj(sel);
    if (!o) return null;
    if (sel.kind === "planet" || sel.kind === "moon"){
      const parentDist = sel.kind === "moon" ? this.S.planets[sel.i].dist : 0;
      return planetStats(this.S, o, sel.kind, parentDist);
    }
    if (sel.kind === "comet") return smallBodyStats(this.S, "comet", o, Math.max(40, o.r));
    if (sel.kind === "rock") return smallBodyStats(this.S, "rock", o, o.dist);
    return null;
  }
  posOf(s){
    if (s.kind === "star") return [0, 0];
    const o = this.obj(s);
    if (!o) return null;
    if (s.kind === "comet") return [o.x, o.y];
    if (s.kind === "rock") return [Math.cos(o.ang)*o.dist, Math.sin(o.ang)*o.dist];
    return [o._x, o._y];
  }
  obj(s){
    if (!s) return null;
    if (s.kind === "star") return { type:"star", temp: this.S.sun.temp, size: this.S.sun.D, ci: this.star.ci };
    if (s.kind === "planet") return this.S.planets[s.i] || null;
    if (s.kind === "comet") return this.S.comets[s.i] || null;
    if (s.kind === "rock") return this.S.belt ? (this.S.belt.rocks[s.i] || null) : null;
    const p = this.S.planets[s.i];
    return p ? (p.moonList[s.j] || null) : null;
  }
  label(s){
    if (s.kind === "star") return this.S.name;
    if (s.kind === "comet"){
      const c = this.obj(s);
      return "C/" + (c ? c.id : "?") + " " + this.S.name.split(" ")[0];
    }
    if (s.kind === "rock"){
      const r = this.obj(s);
      return "(" + (r ? r.num : "?") + ") " + this.S.name.split(" ")[0];
    }
    const base = this.S.name + " " + (LETTERS[s.i] || "?");
    return s.kind === "moon" ? base + " " + (ROM[s.j] || "") : base;
  }
  update(dt){
    stepSystem(this.S, dt);
    if (this.playerShip) this.playerShip.update(dt, this);
    for(const n of this.npcs) n.update(dt, this);
    let camTgt = null;
    if (this.followShip && this.playerShip) camTgt = this.playerShip.globPos(this);
    else if (this.follow && this.sel) camTgt = this.posOf(this.sel);
    if (camTgt){
      const k = 1 - Math.exp(-dt*6);
      this.cam.x += (camTgt[0] - this.cam.x)*k;
      this.cam.y += (camTgt[1] - this.cam.y)*k;
    }
  }
  drawWorldCircleAt(cx, cy, r, col, skip){
    const { sctx, SCR } = this.ctx;
    sctx.fillStyle = col;
    const steps = Math.max(24, Math.ceil(2*Math.PI*r/6));
    for(let i=0;i<steps;i+=skip){
      const a = i/steps*Math.PI*2;
      const X = Math.round(this.ssx(cx + Math.cos(a)*r)), Y = Math.round(this.ssy(cy + Math.sin(a)*r));
      if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
      sctx.fillRect(X, Y, 1, 1);
    }
  }
  drawOrbit(r, col){
    const { sctx, SCR } = this.ctx;
    sctx.fillStyle = col;
    const steps = Math.max(24, Math.ceil(2*Math.PI*r/6));
    for(let i=0;i<steps;i+=2){
      const a = i/steps*Math.PI*2;
      const X = Math.round(this.ssx(Math.cos(a)*r)), Y = Math.round(this.ssy(Math.sin(a)*r));
      if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
      sctx.fillRect(X, Y, 1, 1);
    }
  }
  draw(t){
    const { sctx, SCR } = this.ctx;
    const S = this.S;
    if (this.nebCvs){
      const x0 = this.ssx(-NEB_SPAN/2), y0 = this.ssy(-NEB_SPAN/2);
      sctx.drawImage(this.nebCvs, Math.round(x0), Math.round(y0), NEB_SPAN, NEB_SPAN);
    }
    if (S.bhOnly){
      renderBH(S.bh, t);
      sctx.drawImage(S.bh.cvs, Math.round(SCR/2 - S.bh.C/2), Math.round(SCR/2 - S.bh.C/2));
      if (S.jets){
        const ja = S.jetAng + Math.sin(t*0.7)*0.06;
        for(const dir of [0, Math.PI]){
          const c = Math.cos(ja + dir), s = Math.sin(ja + dir);
          for(let q = S.bh.D*0.75; q < 200; q += 2){
            if ((Math.floor(q) + Math.floor(t*10)) % 2) continue;
            sctx.globalAlpha = Math.max(0.1, 1 - q/210);
            sctx.fillStyle = q < 90 ? "#eaf6ff" : "#8fd0ff";
            sctx.fillRect(Math.round(SCR/2 + c*q), Math.round(SCR/2 + s*q), 1, 1);
          }
        }
        sctx.globalAlpha = 1;
      }
      for(const s of S.sstars){
        sctx.fillStyle = CLS[s.ci].col;
        sctx.fillRect(Math.round(this.ssx(s.x))-1, Math.round(this.ssy(s.y))-1, 2, 2);
      }
      return;
    }
    for(let i=0;i<S.planets.length;i++){
      const hi = this.sel && this.sel.kind === "planet" && this.sel.i === i;
      this.drawOrbit(S.planets[i].dist, hi ? "#3a4a8a" : "#1c2444");
    }
    renderStar(S.sun, t);
    sctx.drawImage(S.sun.cvs, Math.round(this.ssx(0) - S.sun.C/2), Math.round(this.ssy(0) - S.sun.C/2));
    if (S.belt){
      for(const r of S.belt.rocks){
        const X = Math.round(this.ssx(Math.cos(r.ang)*r.dist));
        const Y = Math.round(this.ssy(Math.sin(r.ang)*r.dist));
        if (X < -2 || Y < -2 || X > SCR+2 || Y > SCR+2) continue;
        sctx.fillStyle = r.c;
        sctx.fillRect(X, Y, r.s, r.s);
      }
    }
    for(const c of S.comets){
      const hx = this.ssx(c.x), hy = this.ssy(c.y);
      const Lpx = Math.min(50, Math.max(6, 3200/c.r));
      const rl = Math.hypot(c.x, c.y) || 1;
      const ux = c.x/rl, uy = c.y/rl;
      for(let s=0; s<Lpx; s++){
        const frac = s/Lpx;
        if (frac > 0.5 && s % 2) continue;
        const wob = Math.sin(s*0.35 + t*3 + c.ph)*(0.5 + frac*2);
        sctx.fillStyle = frac < 0.35 ? "#e8f2ff" : "#9fc8ff";
        sctx.globalAlpha = 1 - frac*0.7;
        sctx.fillRect(Math.round(hx + ux*s - uy*wob), Math.round(hy + uy*s + ux*wob), 1, 1);
      }
      sctx.globalAlpha = 1;
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(Math.round(hx)-1, Math.round(hy)-1, 2, 2);
    }
    for(const p of S.planets){
      const [lx, ly, lz] = lightAt(p._x, p._y);
      renderPlanetBody(p, lx, ly, lz);
      sctx.drawImage(p.cvs, Math.round(this.ssx(p._x) - p.C/2), Math.round(this.ssy(p._y) - p.C/2));
      for(const m of p.moonList){
        const [mlx, mly, mlz] = lightAt(m._x, m._y);
        renderPlanetBody(m, mlx, mly, mlz);
        sctx.drawImage(m.cvs, Math.round(this.ssx(m._x) - m.C/2), Math.round(this.ssy(m._y) - m.C/2));
      }
    }
    /* SOI выбранного тела */
    if (this.sel && (this.sel.kind === "planet" || this.sel.kind === "moon")){
      const ps = primaryState(this, this.sel);
      if (ps) this.drawWorldCircleAt(ps.x, ps.y, ps.soi, "#22305a", 4);
    }
    /* предсказанная траектория игрока (в раме его primary, как в KSP) */
    const sh = this.playerShip;
    if (sh && sh.mode === "newton"){
      const ps = primaryState(this, sh.primary);
      if (ps){
        const pts = predictPath(sh, ps.mu, ps.soi, ps.bodyR);
        sctx.fillStyle = "#ffd166";
        sctx.globalAlpha = 0.55;
        for(let i=0;i<pts.length;i+=2){
          const X = Math.round(this.ssx(ps.x + pts[i][0]));
          const Y = Math.round(this.ssy(ps.y + pts[i][1]));
          if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
          sctx.fillRect(X, Y, 1, 1);
        }
        sctx.globalAlpha = 1;
      }
    }
    /* корабли */
    for(const n of this.npcs){
      const [nx, ny] = n.ship.globPos(this);
      n.ship.draw(sctx, this.ssx(nx), this.ssy(ny), t);
    }
    if (sh && sh.mode !== "landed"){
      const [px, py] = sh.globPos(this);
      sh.draw(sctx, this.ssx(px), this.ssy(py), t);
    }
    if (this.sel){
      const pos = this.posOf(this.sel);
      const o = this.obj(this.sel);
      if (pos && o){
        const X = Math.round(this.ssx(pos[0])), Y = Math.round(this.ssy(pos[1]));
        const hr = Math.round((o.size ? o.size/2 : 4) + 5);
        sctx.fillStyle = "#ffd166";
        for(const [ox, oy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
          sctx.fillRect(X + ox*hr - (ox<0?0:3), Y + oy*hr, 4, 1);
          sctx.fillRect(X + ox*hr, Y + oy*hr - (oy<0?0:3), 1, 4);
        }
      }
    }
  }
  drawLabels(){
    if (this.S.bhOnly) return;
    for(let i=0;i<this.S.planets.length;i++){
      const p = this.S.planets[i];
      lblText(this.ctx, LETTERS[i] || "?",
        toLbl(this.ctx, this.ssx(p._x) + p.size/2) + 5, toLbl(this.ctx, this.ssy(p._y)) - 4, "#8d95c9", 11);
    }
    if (this.sel){
      const pos = this.posOf(this.sel);
      if (pos) lblText(this.ctx, this.label(this.sel),
        toLbl(this.ctx, this.ssx(pos[0])) + 12, toLbl(this.ctx, this.ssy(pos[1])) + 20, "#ffd166", 13);
    }
    for(const n of this.npcs){
      if (n.ship.mode !== "newton") continue;
      const [nx, ny] = n.ship.globPos(this);
      lblText(this.ctx, n.name,
        toLbl(this.ctx, this.ssx(nx)) + 6, toLbl(this.ctx, this.ssy(ny)) - 5, "#6fb7ff", 10);
    }
    /* HUD корабля: скорость, высота, элементы орбиты */
    const sh = this.playerShip;
    if (sh && sh.mode !== "landed"){
      const els = sh.els(this);
      if (els){
        const modeRu = sh.mode === "cruise" ? "FSD-круиз" : "ньютонова механика";
        const pName = sh.primary.kind === "star" ? this.S.name : this.label(sh.primary);
        const l1 = modeRu + " · рама: " + pName;
        const l2 = "v=" + els.v.toFixed(1) + " · h=" + Math.max(0, els.r - els.ps.bodyR).toFixed(0) +
          (sh.mode === "newton" && isFinite(els.ra)
            ? " · Ап=" + Math.min(9999, els.ra - els.ps.bodyR).toFixed(0) +
              " · Пер=" + (els.rp - els.ps.bodyR).toFixed(0) + " · e=" + els.e.toFixed(2)
            : (sh.mode === "newton" ? " · гипербола e=" + els.e.toFixed(2) : ""));
        lblText(this.ctx, l1, 12, this.ctx.LW - 30, "#dfe4ff", 11);
        lblText(this.ctx, l2, 12, this.ctx.LW - 14, "#ffd166", 11);
      }
    }
  }
  /** Кандидаты попадания в точку (общая логика для клика и тултипа). */
  hitAt(wx, wy, pad){
    const cands = [];
    this.S.planets.forEach((p, i) => {
      p.moonList.forEach((m, j) => {
        const d = Math.hypot(m._x - wx, m._y - wy);
        if (d < m.size/2 + pad) cands.push({ s:{kind:"moon", i, j}, d, r:m.size/2 });
      });
      const d = Math.hypot(p._x - wx, p._y - wy);
      if (d < p.size/2 + pad) cands.push({ s:{kind:"planet", i, j:0}, d, r:p.size/2 });
    });
    this.S.comets.forEach((c, i) => {
      const d = Math.hypot(c.x - wx, c.y - wy);
      if (d < 3 + pad) cands.push({ s:{kind:"comet", i, j:0}, d, r:3 });
    });
    if (this.S.belt){
      this.S.belt.rocks.forEach((r, i) => {
        const d = Math.hypot(Math.cos(r.ang)*r.dist - wx, Math.sin(r.ang)*r.dist - wy);
        if (d < 2 + pad*0.8) cands.push({ s:{kind:"rock", i, j:0}, d, r:2 });
      });
    }
    {
      const d = Math.hypot(wx, wy);
      if (d < this.S.sun.D/2 + pad) cands.push({ s:{kind:"star", i:0, j:0}, d, r:1000 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (a.r - b.r) || (a.d - b.d));
    return cands[0].s;
  }
  /** Тултип характеристик при наведении — для любого тела, включая звезду. */
  /** Экранные px → мировые координаты. */
  toWorld(mx, my){
    return {
      wx: (mx - this.ctx.SCR/2)/this.zoom + this.cam.x,
      wy: (my - this.ctx.SCR/2)/this.zoom + this.cam.y
    };
  }
  onHover(mx, my){
    if (this.S.bhOnly) return null;
    const { wx, wy } = this.toWorld(mx, my);
    const hit = this.hitAt(wx, wy, 6);
    if (!hit) return null;
    if (hit.kind === "star")
      return starTooltipHTML(this.S.name, CLS[this.star.ci], this.S.sun.D) +
        "<br>μ = " + MU_SUN.toLocaleString("ru-RU");
    const st = this.statsOf(hit);
    if (!st) return null;
    let html = statsTooltipHTML(this.label(hit), st);
    if (hit.kind === "planet" || hit.kind === "moon"){
      const ps = primaryState(this, hit);
      if (ps) html += "<br>μ = " + Math.round(ps.mu) + " · SOI = " + Math.round(ps.soi);
    }
    return html;
  }
  /** Посадка: корабль в ньютоне, в раме выбранного твёрдого тела, низко и небыстро. */
  canLand(){
    const sh = this.playerShip;
    if (!sh || sh.mode !== "newton" || !this.sel) return false;
    if (!sh.sameTarget(this.sel)) return false;
    const k = this.sel.kind;
    if (k === "star") return false;
    const o = this.obj(this.sel);
    if (!o) return false;
    if ((k === "planet" || k === "moon") && o.type === "gas") return false;
    const els = sh.els(this);
    return els && (els.r - els.ps.bodyR) < 40 && els.v < 30;
  }
  onTap(mx, my){
    if (this.S.bhOnly) return;
    const { wx, wy } = this.toWorld(mx, my);
    const hit = this.hitAt(wx, wy, 9);
    if (!hit) return;
    if (this.sel && hit.kind === this.sel.kind && hit.i === this.sel.i && hit.j === this.sel.j){
      this.mgr.push(new BodyScene(this, hit));
    } else {
      this.sel = hit;
      this.mgr.onChange?.();
    }
  }
  onDragStart(){
    if (this.S.bhOnly) return undefined;
    return { cx: this.cam.x, cy: this.cam.y };
  }
  onDragMove(dx, dy, st){
    this.follow = false;
    this.cam.x = st.cx - dx/this.zoom;
    this.cam.y = st.cy - dy/this.zoom;
    this.mgr.onChange?.();
  }
  status(){
    const S = this.S;
    if (S.bhOnly) return {
      title: S.name,
      info: (S.jets ? "квазар" : "сверхмассивная чёрная дыра") + " · S-звёзд: " + S.sstars.length
    };
    const ship = this.playerShip;
    const shipRu = ship ? ({newton:"ньютон", cruise:"FSD", landed:"на поверхности"})[ship.mode] : "";
    return {
      title: S.name,
      info: "система · класс " + CLS[this.star.ci].c + " · планет: " + S.planets.length +
        (S.belt ? " · пояс" : "") + " · комет: " + S.comets.length +
        (ship ? " · корабль: " + shipRu : "") + " · топливо: " + Math.round(player.fuel)
    };
  }
  selectedInfo(){
    const S = this.S;
    if (S.bhOnly) return {
      name: S.name,
      detail: S.jets ? "квазар: аккреционный диск, джеты и S-звёзды" : "сверхмассивная ЧД: диск и S-звёзды"
    };
    if (!this.sel) return { name: S.name, detail: "кликните по любому телу: планете, луне, комете, обломку или звезде" };
    const o = this.obj(this.sel);
    if (this.sel.kind === "star"){
      const cls = CLS[this.star.ci];
      return {
        name: this.S.name,
        detail: "спектральный класс " + cls.c + " · ≈" + cls.temp.toLocaleString("ru-RU") + " K" +
          " · Ø " + this.S.sun.D + " px<br>" + (cls.c === "O" ? "голубой сверхгигант" :
          cls.c === "M" ? "красный карлик" : cls.c === "L" ? "коричневый карлик" : "звезда главной последовательности") +
          "<br>возможен выход на орбиту (посадка — нет)"
      };
    }
    const st = this.statsOf(this.sel);
    if (this.sel.kind === "comet")
      return { name: this.label(this.sel),
        detail: "комета · a=" + Math.round(o.a) + " · e=" + o.e.toFixed(2) +
          " · сейчас r=" + Math.round(o.r) +
          (st ? "<br>T ядра: " + (st.tempC > 0 ? "+" : "") + st.tempC + " °C · " + st.liquid : "") };
    if (this.sel.kind === "rock")
      return { name: this.label(this.sel),
        detail: "обломок пояса · орбита " + Math.round(o.dist) +
          (st ? "<br>недра: " + st.minerals : "") };
    const base = this.sel.kind === "planet"
      ? PT_RU[o.type] + " · орбита " + o.dist + " · спутников: " + o.moonList.length
      : "спутник · " + PT_RU[o.type] + " · Ø " + o.size + " px";
    return {
      name: this.label(this.sel),
      detail: base + (st ? "<br>T ср: " + (st.tempC > 0 ? "+" : "") + st.tempC +
        " °C · " + st.pressure + "<br>атмосфера: " + st.atm : "")
    };
  }
  primary(){
    if (this.S.bhOnly) return { label:"← к галактике", run: () => this.mgr.pop() };
    if (this.canLand()){
      return { label:"Посадка", run: () => {
        this.playerShip.land(this.sel);
        this.mgr.push(new LandingScene(this, { ...this.sel }, this.statsOf(this.sel)));
      } };
    }
    if (this.sel && this.playerShip){
      return { label:"FSD к выбранному (F, h=" + this.orbitAlt + ")", run: () => {
        this.playerShip.fsdTo(this.sel, this.orbitAlt);
        this.mgr.onChange?.();
      } };
    }
    return { label:"Полёт к объекту", run: () => {
      if (this.sel) this.mgr.push(new BodyScene(this, this.sel));
    } };
  }
  panelSpec(){
    if (this.S.bhOnly) return [];
    const spec = [
      { kind:"range", label:"Высота орбиты", min:8, max:48, step:2,
        get:() => this.orbitAlt, set:v => { this.orbitAlt = v; } },
      { kind:"check", label:"Следить за выбранным",
        get:() => this.follow, set:v => { this.follow = v; if (v) this.followShip = false; } },
      { kind:"check", label:"Камера: корабль",
        get:() => this.followShip, set:v => { this.followShip = v; if (v) this.follow = false; } }
    ];
    if (this.sel && this.playerShip && this.playerShip.mode !== "landed"){
      const sameBody = this.playerShip.sameTarget(this.sel);
      spec.push({ kind:"action",
        label: sameBody ? "Выйти на орбиту (h=" + this.orbitAlt + ")" : "FSD → орбита (h=" + this.orbitAlt + ")",
        run: () => {
          if (sameBody) this.playerShip.setCircular(this, this.sel, this.orbitAlt);
          else this.playerShip.fsdTo(this.sel, this.orbitAlt);
          this.mgr.onChange?.();
        } });
    }
    if (this.playerShip && this.playerShip.mode === "newton"){
      spec.push({ kind:"action", label:"Циркуляризовать орбиту (C)",
        run: () => { this.playerShip.circularize(this); this.mgr.onChange?.(); } });
    }
    if (this.sel) spec.push({ kind:"action", label:"Осмотреть (крупный план)",
      run: () => this.mgr.push(new BodyScene(this, { ...this.sel })) });
    return spec;
  }
}
