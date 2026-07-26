import { bakePlanet, renderPlanetBody, PT_RU } from "../gen/planet.js";
import { lightAt } from "../gen/system.js";
import { NEB_SPAN } from "../gen/nebula.js";

export class BodyScene {
  constructor(sysScene, selRef){
    this.sys = sysScene;
    this.selRef = selRef;
    this.crumb = "Тело";
    const o = sysScene.obj(selRef);
    if (selRef.kind === "comet"){
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
    bakePlanet(this.focus);
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
      return;
    }
    if (this.selRef.kind === "rock"){
      this.focus.rot = t*0.25;
      const [rlx, rly, rlz] = lightAt(pos[0], pos[1]);
      renderPlanetBody(this.focus, rlx, rly, rlz);
      sctx.drawImage(this.focus.cvs, Math.round(SCR/2 - this.focus.C/2), Math.round(SCR/2 - this.focus.C/2));
      return;
    }
    this.focus.rot = src.rot; this.focus.crot = src.crot;
    const [lx, ly, lz] = lightAt(src._x, src._y);
    renderPlanetBody(this.focus, lx, ly, lz);
    sctx.drawImage(this.focus.cvs, Math.round(SCR/2 - this.focus.C/2), Math.round(SCR/2 - this.focus.C/2));
    if (this.selRef.kind === "planet"){
      const baseR = (this.focus.rings ? this.focus.size*1.18 : this.focus.size/2) + 22;
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
        sctx.drawImage(m.cvs,
          Math.round(SCR/2 + Math.cos(m.ang)*dispR - s/2),
          Math.round(SCR/2 + Math.sin(m.ang)*dispR - s/2), s, s);
      }
    }
  }
  status(){
    const o = this.sys.obj(this.selRef);
    let info = "";
    if (o){
      if (this.selRef.kind === "planet") info = PT_RU[o.type] + " · орбита " + o.dist;
      else if (this.selRef.kind === "moon") info = "спутник · " + PT_RU[o.type];
      else if (this.selRef.kind === "comet") info = "комета · r = " + Math.round(o.r);
      else if (this.selRef.kind === "rock") info = "обломок пояса · орбита " + Math.round(o.dist);
    }
    return { title: this.sys.label(this.selRef), info };
  }
  selectedInfo(){ return this.sys.selectedInfo(); }
  primary(){ return { label:"← к системе", run: () => this.mgr.pop() }; }
  panelSpec(){ return []; }
}
