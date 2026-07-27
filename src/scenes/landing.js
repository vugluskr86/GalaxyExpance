import { mulberry32 } from "../core/rng.js";
import { fbm } from "../core/noise.js";
import { BAYER, hex2rgb, lerp3, blackbody } from "../core/color.js";
import { PT } from "../gen/planet.js";
import { player } from "../game/player.js";
import { lblText } from "../ui/panel.js";

/** Панорама на поверхности: небо ← атмосфера, свет ← положение солнца
 *  (фаза вращения планеты), рельеф ← ландшафт, восходы лун ← их орбиты. */
export class LandingScene {
  constructor(sys, selRef, stats){
    this.sys = sys;
    this.selRef = selRef;
    this.stats = stats;
    this.crumb = "Поверхность";
    const p = sys.obj(selRef);
    this.p = p;
    /* тип ландшафта и зерно: у комет/обломков — мёртвый скальный мир */
    this.terr = (selRef.kind === "comet" || selRef.kind === "rock") ? "moon" : p.type;
    this.seedv = (p.seed ?? p.rseed ?? ((p.id || 1)*77)) | 0;
    player.refuel();
    sys.playerShip?.prop.refuel();

    const SCR = 420;
    const rng = mulberry32(this.seedv ^ 0x1a2d);
    this.ns = Math.floor(rng()*99999);
    /* два хребта: дальний и ближний */
    this.h2 = new Float32Array(SCR);
    this.h1 = new Float32Array(SCR);
    const rough = this.terr === "moon" || this.terr === "lava" ? 1.6 : (this.terr === "ocean" ? 0.35 : 1);
    for(let x=0;x<SCR;x++){
      this.h2[x] = fbm(x*0.012, 3.1, 0, this.ns, 4)*70*rough;
      this.h1[x] = fbm(x*0.02, 7.7, 0, this.ns ^ 0x99, 4)*95*rough;
    }
    /* растительность: позиции ростков на ближнем хребте */
    this.plants = [];
    if (stats.veg !== "нет" && this.terr !== "ocean"){
      for(let i=0;i<26;i++){
        this.plants.push({ x: Math.floor(rng()*SCR), s: 2 + Math.floor(rng()*4) });
      }
    }
    /* звёзды для тёмного неба */
    this.stars = [];
    for(let i=0;i<90;i++) this.stars.push({ x: rng()*SCR, y: rng()*SCR*0.62, b: rng() });

    /* цвета неба по типу мира */
    const SKY = {
      terran:["#0a1a3f","#3e79c9","#cfe3f5"], ocean:["#0a1a3f","#2f6ab8","#bcd8ef"],
      desert:["#20100a","#a8622a","#e8b878"], ice:["#0a1430","#4a6a9a","#c8daea"],
      lava:["#150507","#5f150f","#c84a1c"], alien:["#160a28","#5b2d7a","#7ee08a"],
      moon:["#000000","#000000","#000000"]
    };
    const sk = SKY[this.terr] || SKY.moon;
    this.zen = hex2rgb(sk[0]); this.mid = hex2rgb(sk[1]); this.hor = hex2rgb(sk[2]);
    const bands = PT[this.terr].gas ? null : PT[this.terr].bands;
    this.groundCol = hex2rgb(bands ? bands[Math.min(2, bands.length-1)][1] : "#6b6675");
    this.sunRGB = blackbody(this.sys.S.sun.temp);
    this.vegCol = this.terr === "alien" ? [124, 63, 168] : [38, 92, 44];
  }
  update(dt){ this.sys.update(dt); }
  dayPhase(){
    const k = this.selRef.kind;
    const src = k === "comet" ? this.p.th : (k === "rock" ? this.p.ang : this.p.rot);
    return ((src % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
  }
  draw(t){
    const { sctx, SCR } = this.ctx;
    const ph = this.dayPhase();
    const sunEl = Math.sin(ph);                       // -1..1 высота солнца
    const hasAtm = this.stats.hasAtm;
    const bright = hasAtm ? Math.max(0.10, Math.min(1, 0.52 + 0.55*sunEl)) : 0.06;
    const horY = Math.round(SCR*0.62);

    /* небо: квантованный градиент с дизерингом */
    const ROWS = 7;
    for(let r=0;r<ROWS;r++){
      const y0 = Math.round(horY*r/ROWS), y1 = Math.round(horY*(r+1)/ROWS);
      const f = r/(ROWS-1);
      const base = f < 0.55 ? lerp3(this.zen, this.mid, f/0.55) : lerp3(this.mid, this.hor, (f-0.55)/0.45);
      const col = lerp3([2,3,8], base, bright);
      sctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      sctx.fillRect(0, y0, SCR, y1-y0);
    }
    /* звёзды в темноте / без атмосферы */
    if (bright < 0.34){
      for(const s of this.stars){
        if (s.b < 0.3 && Math.floor(t*2 + s.b*10) % 2) continue;
        sctx.fillStyle = s.b > 0.85 ? "#ffd166" : "#cdd4ee";
        sctx.globalAlpha = Math.min(1, (0.34 - bright)*4)*(0.4 + s.b*0.6);
        sctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      sctx.globalAlpha = 1;
    }
    /* солнце */
    const sunX = SCR*(0.5 - Math.cos(ph)*0.46);
    const sunY = horY - sunEl*(horY - 26);
    if (sunEl > -0.22){
      const D = Math.round(14 + this.sys.S.sun.D*0.1);
      const [sr, sg, sb] = this.sunRGB;
      if (hasAtm && sunEl < 0.25){
        sctx.fillStyle = `rgba(${sr},${Math.round(sg*0.7)},${Math.round(sb*0.4)},0.35)`;
        sctx.fillRect(Math.round(sunX - D*1.6), Math.round(sunY - D*0.8), D*3.2, D*1.6);
      }
      sctx.fillStyle = `rgb(${sr},${sg},${sb})`;
      for(let dy=-D/2; dy<D/2; dy++){
        const w = Math.sqrt(Math.max(0, (D/2)**2 - dy*dy));
        sctx.fillRect(Math.round(sunX - w), Math.round(sunY + dy), Math.round(w*2), 1);
      }
    }
    /* восходы лун: положение из их орбитальных углов относительно суток */
    const moons = this.selRef.kind === "planet" ? this.p.moonList : [];
    for(let i=0;i<moons.length;i++){
      const m = moons[i];
      const mph = m.ang - ph*0.35 + i*1.1;
      const el = Math.sin(mph);
      if (el < -0.1) continue;
      const mx = SCR*(0.5 - Math.cos(mph)*0.44);
      const my = horY - el*(horY - 40);
      const R = 4 + Math.round(m.size*0.55);
      const lit = Math.sign(sunX - mx) || 1;
      for(let dy=-R; dy<=R; dy++){
        const w = Math.round(Math.sqrt(Math.max(0, R*R - dy*dy)));
        for(let dx=-w; dx<=w; dx++){
          const bay = BAYER[((dy+R) & 3)*4 + ((dx+w) & 3)];
          const litSide = (dx*lit)/Math.max(1, w);
          const lum = Math.max(0.18, 0.5 + litSide*0.5 + bay*0.15);
          const g = Math.round(150*lum + 40*bright);
          sctx.fillStyle = `rgb(${g},${g},${Math.round(g*1.08)})`;
          sctx.fillRect(Math.round(mx+dx), Math.round(my+dy), 1, 1);
        }
      }
    }
    /* дальний хребет */
    const far = lerp3(lerp3(this.groundCol, [0,0,0], 0.55), this.mid, hasAtm ? 0.35*bright : 0);
    sctx.fillStyle = `rgb(${far[0]},${far[1]},${far[2]})`;
    for(let x=0;x<SCR;x++)
      sctx.fillRect(x, Math.round(horY - this.h2[x]), 1, SCR);
    /* жидкость: полоса моря с бликом под солнцем */
    if (this.stats.liquid.includes("вода") || this.stats.liquid.includes("метан")){
      const seaY = Math.round(SCR*0.80);
      const sea = this.stats.liquid.includes("метан") ? [26, 44, 38] : [16, 42, 84];
      const seaCol = lerp3(sea, [200,220,255], 0.15*bright);
      sctx.fillStyle = `rgb(${seaCol[0]},${seaCol[1]},${seaCol[2]})`;
      sctx.fillRect(0, seaY, SCR, SCR - seaY);
      if (sunEl > 0.02){
        sctx.fillStyle = "rgba(255,240,200,0.5)";
        for(let y=seaY; y<SCR; y+=2){
          const w = Math.max(1, Math.round(6 - (y-seaY)*0.1 + Math.sin(t*3 + y)*2));
          sctx.fillRect(Math.round(sunX - w/2), y, w, 1);
        }
      }
    }
    /* ближний хребет + растительность */
    const near = lerp3(this.groundCol, [0,0,0], 0.75 - 0.25*bright);
    sctx.fillStyle = `rgb(${near[0]},${near[1]},${near[2]})`;
    for(let x=0;x<SCR;x++)
      sctx.fillRect(x, Math.round(SCR*0.78 - this.h1[x]*0.6), 1, SCR);
    if (this.plants.length){
      const vc = lerp3(this.vegCol, [0,0,0], 0.6 - 0.35*bright);
      sctx.fillStyle = `rgb(${vc[0]},${vc[1]},${vc[2]})`;
      for(const pl of this.plants){
        const gy = Math.round(SCR*0.78 - this.h1[pl.x]*0.6);
        sctx.fillRect(pl.x, gy - pl.s, 2, pl.s);
        sctx.fillRect(pl.x - 1, gy - pl.s, 4, 1);
      }
    }
  }
  drawLabels(){
    const hours = ((this.dayPhase()/(Math.PI*2))*24 + 6) % 24;
    const hh = String(Math.floor(hours)).padStart(2, "0");
    const mm = String(Math.floor((hours % 1)*60)).padStart(2, "0");
    lblText(this.ctx, "местное время " + hh + ":" + mm +
      " · T " + (this.stats.tempC > 0 ? "+" : "") + this.stats.tempC + " °C · " + this.stats.pressure,
      12, this.ctx.LW - 14, "#dfe4ff", 12);
  }
  status(){
    return {
      title: this.sys.label(this.selRef) + " · поверхность",
      info: this.stats.typeRu + " · " + this.stats.atm + " · заправлено (топливо 100)"
    };
  }
  selectedInfo(){
    const st = this.stats;
    return {
      name: this.sys.label(this.selRef),
      detail: "T ср: " + (st.tempC > 0 ? "+" : "") + st.tempC + " °C · " + st.pressure +
        "<br>жидкость: " + st.liquid + "<br>недра: " + st.minerals +
        "<br>растительность: " + st.veg
    };
  }
  primary(){
    return { label:"Взлёт", run: () => {
      const ship = this.sys.playerShip;
      if (ship) ship.takeoff(this.sys, this.sys.orbitAlt);
      this.mgr.pop();
    } };
  }
  panelSpec(){ return []; }
}
