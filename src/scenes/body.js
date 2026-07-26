import { bakePlanet, renderPlanetBody, PT_RU } from "../gen/planet.js";
import { renderStar } from "../gen/star.js";
import { CLS } from "../gen/starclass.js";
import { lightAt } from "../gen/system.js";
import { NEB_SPAN } from "../gen/nebula.js";
import { planetStats, statsTooltipHTML } from "../game/stats.js";
import { LandingScene } from "./landing.js";

export class BodyScene {
  constructor(sysScene, selRef){
    this.sys = sysScene;
    this.selRef = selRef;
    this.crumb = selRef.kind === "star" ? "Звезда" : "Тело";
    const o = sysScene.obj(selRef);
    if (selRef.kind === "star"){
      this.focus = null;  // рендерим звезду напрямую
      this.starTimePhase = Math.random()*100;
    } else if (selRef.kind === "comet"){
      this.focus = { type:"moon", seed:(o.id*77)|0, rings:false, clouds:false, size:18, moons:0 };
    } else if (selRef.kind === "rock"){
      this.focus = { type:"moon", seed:o.rseed, rings:false, clouds:false, size:120, moons:0 };
    } else {
      this.focus = {
        type:o.type, seed:o.seed,
        rings: selRef.kind === "planet" ? o.rings : false,
        clouds: selRef.kind === "planet" ? o.clouds : false,
        size: selRef.kind === "moon" ? 150 : (o.rings ? 96 : 176),
        moons:0
      };
    }
    if (this.focus) bakePlanet(this.focus);
    this.moonSel = null;  // { i } — выбранный спутник, если смотрим планету
  }
  /** Базовый радиус дисплея спутников (вычисляется как в draw). */
  moonDispR(){
    if (!this.focus) return 0;
    return (this.focus.rings ? this.focus.size*1.18 : this.focus.size/2) + 22;
  }
  update(dt){ this.sys.update(dt); }
  draw(t){
    const { sctx, SCR } = this.ctx;
    const src = this.sys.obj(this.selRef);
    if (!src){ this.mgr.pop(); return; }
    if (this.sys.nebCvs){
      sctx.drawImage(this.sys.nebCvs, Math.round((SCR-NEB_SPAN)/2), Math.round((SCR-NEB_SPAN)/2), NEB_SPAN, NEB_SPAN);
    }
    const pos = this.sys.posOf(this.selRef);
    /* звезда — крупный план */
    if (this.selRef.kind === "star"){
      const sun = this.sys.S.sun;
      const scale = Math.min(SCR / sun.C, SCR*0.7 / sun.D);
      renderStar(sun, t + this.starTimePhase);
      const drawW = Math.round(sun.C * scale);
      sctx.drawImage(sun.cvs, 0, 0, sun.C, sun.C, Math.round((SCR - drawW)/2), Math.round((SCR - drawW)/2), drawW, drawW);
      /* корона: лучи */
      const cx = SCR/2, cy = SCR/2;
      const coronaR = sun.D*scale*0.65;
      for(let i=0;i<64;i++){
        const a = i/64*Math.PI*2;
        const ray = 0.5 + 0.24*Math.sin(a*7 + t*0.9 + this.starTimePhase) + 0.16*Math.sin(a*13 - t*1.7 + this.starTimePhase) + 0.10*Math.sin(a*23 + t*2.6);
        const len = coronaR*(0.4 + ray*0.6);
        if ((i + Math.floor(t*8)) % 2) continue;
        sctx.globalAlpha = 0.15 + ray*0.25;
        sctx.fillStyle = CLS[this.sys.star.ci].col;
        sctx.fillRect(Math.round(cx + Math.cos(a)*len), Math.round(cy + Math.sin(a)*len), 1, 1);
      }
      sctx.globalAlpha = 1;
      this.drawShips(sctx, t);
      return;
    }
    if (this.selRef.kind === "comet"){
      const rl = Math.hypot(pos[0], pos[1]) || 1;
      const ux = pos[0]/rl, uy = pos[1]/rl;
      const Lpx = Math.min(230, Math.max(60, 14000/src.r));
      for(let s=0; s<Lpx; s++){
        const frac = s/Lpx;
        if (frac > 0.45 && s % 2 === Math.floor(t*8) % 2) continue;
        if (frac > 0.75 && s % 3 !== 0) continue;
        const wob = Math.sin(s*0.35 + t*3 + src.ph)*(0.5 + frac*6);
        const X = Math.round(SCR/2 + ux*8 + ux*s - uy*wob);
        const Y = Math.round(SCR/2 + uy*8 + uy*s + ux*wob);
        if (X < 0 || Y < 0 || X >= SCR || Y >= SCR) continue;
        sctx.fillStyle = frac < 0.3 ? "#e8f2ff" : (frac < 0.65 ? "#9fc8ff" : "#5f7fc0");
        sctx.globalAlpha = 1 - frac*0.75;
        sctx.fillRect(X, Y, 1, 1);
      }
      sctx.globalAlpha = 1;
      for(let i=0;i<26;i++){
        const a = i/26*Math.PI*2;
        const rr = 13 + Math.sin(a*3 + t*2)*2;
        if ((i + Math.floor(t*6)) % 2) continue;
        sctx.fillStyle = "#9fc8ff";
        sctx.globalAlpha = 0.5;
        sctx.fillRect(Math.round(SCR/2 + Math.cos(a)*rr), Math.round(SCR/2 + Math.sin(a)*rr), 1, 1);
      }
      sctx.globalAlpha = 1;
      this.focus.rot = t*0.4;
      const [clx, cly, clz] = lightAt(pos[0], pos[1]);
      renderPlanetBody(this.focus, clx, cly, clz);
      sctx.drawImage(this.focus.cvs, Math.round(SCR/2 - this.focus.C/2), Math.round(SCR/2 - this.focus.C/2));
      this.drawShips(sctx, t);
      return;
    }
    if (this.selRef.kind === "rock"){
      this.focus.rot = t*0.25;
      const [rlx, rly, rlz] = lightAt(pos[0], pos[1]);
      renderPlanetBody(this.focus, rlx, rly, rlz);
      sctx.drawImage(this.focus.cvs, Math.round(SCR/2 - this.focus.C/2), Math.round(SCR/2 - this.focus.C/2));
      this.drawShips(sctx, t);
      return;
    }
    this.focus.rot = src.rot; this.focus.crot = src.crot;
    const [lx, ly, lz] = lightAt(src._x, src._y);
    renderPlanetBody(this.focus, lx, ly, lz);
    sctx.drawImage(this.focus.cvs, Math.round(SCR/2 - this.focus.C/2), Math.round(SCR/2 - this.focus.C/2));
    if (this.selRef.kind === "planet"){
      const baseR = this.moonDispR();
      for(let i=0;i<src.moonList.length;i++){
        const m = src.moonList[i];
        const dispR = baseR + i*17;
        sctx.fillStyle = "#1c2444";
        const steps = Math.ceil(2*Math.PI*dispR/6);
        for(let q=0;q<steps;q+=2){
          const a = q/steps*Math.PI*2;
          sctx.fillRect(Math.round(SCR/2 + Math.cos(a)*dispR), Math.round(SCR/2 + Math.sin(a)*dispR), 1, 1);
        }
        renderPlanetBody(m, lx, ly, lz);
        const s = m.C*2;
        const mX = Math.round(SCR/2 + Math.cos(m.ang)*dispR - s/2);
        const mY = Math.round(SCR/2 + Math.sin(m.ang)*dispR - s/2);
        sctx.drawImage(m.cvs, mX, mY, s, s);
        /* выделение выбранного спутника */
        if (this.moonSel && this.moonSel.i === i){
          const cX = Math.round(SCR/2 + Math.cos(m.ang)*dispR);
          const cY = Math.round(SCR/2 + Math.sin(m.ang)*dispR);
          const hr = Math.round(s/2 + 4);
          sctx.fillStyle = "#ffd166";
          for(const [ox, oy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
            sctx.fillRect(cX + ox*hr - (ox<0?0:3), cY + oy*hr, 4, 1);
            sctx.fillRect(cX + ox*hr, cY + oy*hr - (oy<0?0:3), 1, 4);
          }
        }
      }
    }
    this.drawShips(sctx, t);
  }
  /** Экранная позиция корабля в СХЕМАТИЧЕСКОМ пространстве крупного плана.
   *  Корабль на орбите привязывается к нарисованному телу (центр схемы или
   *  спутник на его увеличенной орбите), поэтому окружность остаётся
   *  окружностью — независимо от того, где тело находится в реальных
   *  координатах системы. Летящие корабли проецируются масштабом схемы. */
  shipScreenPos(ship){
    const SCR = this.ctx.SCR;
    const src = this.sys.obj(this.selRef);
    if (!src) return null;
    const tg = ship.target;
    if (ship.state === "orbit" && tg){
      /* орбита вокруг просматриваемого тела → круг вокруг центра схемы */
      const viewingTarget =
        tg.kind === this.selRef.kind && tg.i === this.selRef.i &&
        (tg.kind !== "moon" || tg.j === this.selRef.j);
      if (viewingTarget && this.selRef.kind !== "star" && this.focus){
        const R = this.focus.size/2 + 12;
        return [SCR/2 + Math.cos(ship.orbitA)*R, SCR/2 + Math.sin(ship.orbitA)*R];
      }
      if (viewingTarget && this.selRef.kind === "star"){
        const sun = this.sys.S.sun;
        const scale = Math.min(SCR / sun.C, SCR*0.7 / sun.D);
        const R = (sun.D/2)*scale + 14;
        return [SCR/2 + Math.cos(ship.orbitA)*R, SCR/2 + Math.sin(ship.orbitA)*R];
      }
      /* орбита вокруг спутника, показанного на схеме планеты */
      if (this.selRef.kind === "planet" && tg.kind === "moon" && tg.i === this.selRef.i &&
          src.moonList && src.moonList[tg.j]){
        const mp = this.moonScreenPos(tg.j, src);
        if (mp){
          const R = mp.size + 7;
          return [mp.x + Math.cos(ship.orbitA)*R, mp.y + Math.sin(ship.orbitA)*R];
        }
      }
    }
    /* общий случай (перелёт, чужая орбита): реальные координаты, масштаб схемы */
    const center = this.sys.posOf(this.selRef);
    if (!center) return null;
    const realSize = src.size || 8;
    const k = (this.focus ? this.focus.size : SCR*0.5)/Math.max(12, realSize);
    const X = (ship.x - center[0])*k + SCR/2;
    const Y = (ship.y - center[1])*k + SCR/2;
    if (X < -30 || Y < -30 || X > SCR + 30 || Y > SCR + 30) return null;
    return [X, Y];
  }
  drawShips(sctx, t){
    for(const n of this.sys.npcs){
      const p = this.shipScreenPos(n.ship);
      if (p) n.ship.draw(sctx, p[0], p[1], t);
    }
    const ps = this.sys.playerShip;
    if (ps && ps.state !== "landed"){
      const p = this.shipScreenPos(ps);
      if (p) ps.draw(sctx, p[0], p[1], t);
    }
  }
  /** Позиция спутника на экране (центр). */
  moonScreenPos(i, src){
    if (!this.focus) return null;
    const baseR = this.moonDispR();
    const m = src.moonList[i];
    const dispR = baseR + i*17;
    return {
      x: this.ctx.SCR/2 + Math.cos(m.ang)*dispR,
      y: this.ctx.SCR/2 + Math.sin(m.ang)*dispR,
      size: m.C
    };
  }
  onHover(mx, my){
    if (this.selRef.kind !== "planet") return null;
    const src = this.sys.obj(this.selRef);
    if (!src || !src.moonList) return null;
    for(let i=0;i<src.moonList.length;i++){
      const m = src.moonList[i];
      const mp = this.moonScreenPos(i, src);
      if (!mp) continue;
      const d = Math.hypot(mp.x - mx, mp.y - my);
      if (d < mp.size + 5){
        const st = planetStats(this.sys.S, m, "moon", src.dist);
        const label = this.sys.label({ kind:"moon", i:this.selRef.i, j:i });
        return st ? statsTooltipHTML(label, st) : `<b>${label}</b><br>${PT_RU[m.type]}`;
      }
    }
    return null;
  }
  onTap(mx, my){
    if (this.selRef.kind !== "planet") return;
    const src = this.sys.obj(this.selRef);
    if (!src || !src.moonList) return;
    let best = null, bd = 1e9;
    for(let i=0;i<src.moonList.length;i++){
      const mp = this.moonScreenPos(i, src);
      if (!mp) continue;
      const d = Math.hypot(mp.x - mx, mp.y - my);
      if (d < mp.size + 8 && d < bd){ bd = d; best = i; }
    }
    if (best === null){
      if (this.moonSel){ this.moonSel = null; this.mgr.onChange?.(); }
      return;
    }
    if (this.moonSel && this.moonSel.i === best){
      /* двойной клик: войти в спутник */
      this.mgr.push(new BodyScene(this.sys, { kind:"moon", i:this.selRef.i, j:best }));
    } else {
      this.moonSel = { i:best };
      this.mgr.onChange?.();
    }
  }
  status(){
    const o = this.sys.obj(this.selRef);
    let info = "";
    if (o){
      if (this.selRef.kind === "star") info = "спектральный класс " + CLS[this.sys.star.ci].c +
        " · ≈" + CLS[this.sys.star.ci].temp.toLocaleString("ru-RU") + " K · Ø " + this.sys.S.sun.D + " px";
      else if (this.selRef.kind === "planet") info = PT_RU[o.type] + " · орбита " + o.dist;
      else if (this.selRef.kind === "moon") info = "спутник · " + PT_RU[o.type];
      else if (this.selRef.kind === "comet") info = "комета · r = " + Math.round(o.r);
      else if (this.selRef.kind === "rock") info = "обломок пояса · орбита " + Math.round(o.dist);
    }
    return { title: this.sys.label(this.selRef), info };
  }
  selectedInfo(){
    if (this.selRef.kind === "planet" && this.moonSel){
      const src = this.sys.obj(this.selRef);
      const m = src && src.moonList ? src.moonList[this.moonSel.i] : null;
      if (m){
        const st = planetStats(this.sys.S, m, "moon", src.dist);
        return {
          name: this.sys.label({ kind:"moon", i:this.selRef.i, j:this.moonSel.i }),
          detail: "спутник · " + PT_RU[m.type] +
            (st ? "<br>T ср: " + (st.tempC > 0 ? "+" : "") + st.tempC + " °C · " + st.pressure : "")
        };
      }
    }
    return this.sys.selectedInfo();
  }
  moonRef(){ return { kind:"moon", i:this.selRef.i, j:this.moonSel.i }; }
  canLandOnMoon(){
    if (!this.moonSel) return false;
    const ship = this.sys.playerShip;
    if (!ship || ship.state !== "orbit") return false;
    if (!ship.sameTarget(this.moonRef())) return false;
    const src = this.sys.obj(this.selRef);
    if (!src || !src.moonList) return false;
    const m = src.moonList[this.moonSel.i];
    return m && m.type !== "gas";
  }
  primary(){
    if (this.selRef.kind === "planet" && this.moonSel !== null){
      const ship = this.sys.playerShip;
      if (this.canLandOnMoon()){
        return { label:"Посадка на спутник", run: () => {
          ship.state = "landed";
          const src = this.sys.obj(this.selRef);
          const m = src.moonList[this.moonSel.i];
          const st = planetStats(this.sys.S, m, "moon", src.dist);
          this.mgr.push(new LandingScene(this.sys, this.moonRef(), st));
        } };
      }
      if (ship){
        return { label:"Орбита спутника (h=" + this.sys.orbitAlt + ")", run: () => {
          ship.orbitAt(this.moonRef(), this.sys.orbitAlt);
          this.mgr.onChange?.();
        } };
      }
    }
    return { label:"← к системе", run: () => this.mgr.pop() };
  }
  panelSpec(){ return []; }
}
