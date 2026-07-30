import { Galaxy, SECT } from "../gen/galaxy.js";
import { buildSystem } from "../gen/system.js";
import { systemId } from "../core/ids.js";
import { bakeGalaxyNebSprite } from "../gen/nebula.js";
import { CLS, CLS_RU } from "../gen/starclass.js";
import { renderBH } from "../gen/blackhole.js";
import { SystemScene } from "./system.js";
import { lblText, toLbl } from "../ui/panel.js";
import { settings } from "../ui/settings.js";
import { player } from "../game/player.js";
import { t } from "../i18n/index.js";
import { economicDay, economicTick } from "../game/economy.js";
import { advanceContracts, contractsAt, contractsForSystem } from "../game/contracts.js";
import { advanceWorldEvents, eventAt } from "../game/events.js";
import { rumorInsight } from "../game/progression.js";

const LODS = [
  { secZoom:0.7,  secCap:900,  dustRes:160 },
  { secZoom:0.45, secCap:1700, dustRes:240 },
  { secZoom:0.30, secCap:3200, dustRes:340 }
];

export class GalaxyScene {
  constructor(galDef,world=null){
    this.gal = galDef;                    // запись кластера {def, name, desig, ...}
    this.g = new Galaxy(galDef.def);
    this.world = world;
    this.crumb = "Галактика";
    this.cam = { x:0, y:0 };
    this.zoom = 0.2;
    this.camT = { x:0, y:0, zoom:0.2 };
    this.TH = 0; this.cosR = 1; this.sinR = 0;
    this.sel = null;
    this.anchor = null;
    this.clsFilter = null;
    this.visSectors = 0; this.visStars = 0;
    this.tradeRumors=new Map();
  }
  enter(){
    this.g.bakeDust(LODS[settings.lod].dustRes, settings.dust);
    this.fit();
  }
  onViewChange(){
    this.g.bakeDust(LODS[settings.lod].dustRes, settings.dust);
  }
  rebuild(){
    this.g.rebuild();
    this.g.bakeDust(LODS[settings.lod].dustRes, settings.dust);
    this.sel = null; this.anchor = null; this.clsFilter = null; this.tradeRumors.clear();
    this.mgr.onChange?.();
  }
  dispPt(x, y){ return [x*this.cosR - y*this.sinR, x*this.sinR + y*this.cosR]; }
  genPt(x, y){ return [x*this.cosR + y*this.sinR, -x*this.sinR + y*this.cosR]; }
  fit(){ this.anchor = null; this.camT.x = 0; this.camT.y = 0; this.camT.zoom = this.ctx.SCR/(this.g.def.R*2.5); }
  wsx(wx){ return (wx - this.cam.x)*this.zoom + this.ctx.SCR/2; }
  wsy(wy){ return (wy - this.cam.y)*this.zoom + this.ctx.SCR/2; }
  update(dt){
    this.TH += settings.rot*dt;
    this.cosR = Math.cos(this.TH); this.sinR = Math.sin(this.TH);
    if (this.anchor){
      const [ax, ay] = this.dispPt(this.anchor.x, this.anchor.y);
      this.camT.x = ax; this.camT.y = ay;
    }
    const k = 1 - Math.exp(-dt*5);
    this.cam.x += (this.camT.x - this.cam.x)*k;
    this.cam.y += (this.camT.y - this.cam.y)*k;
    this.zoom += (this.camT.zoom - this.zoom)*k;
  }
  starSize(lum){
    if (this.zoom > 2.2) return lum > 0.8 ? 3 : (lum > 0.5 ? 2 : 1);
    if (this.zoom > 1.0) return lum > 0.85 ? 2 : 1;
    return 1;
  }
  drawStarPx(x, y, ci, lum, ph, t){
    const { sctx } = this.ctx;
    let a = 1;
    if (settings.twinkle && lum > 0.55) a = 0.55 + 0.45*(0.5 + 0.5*Math.sin(t*(1+lum*2) + ph));
    if (this.clsFilter !== null && ci !== this.clsFilter) a *= 0.16;
    const s = this.starSize(lum);
    sctx.globalAlpha = a;
    sctx.fillStyle = CLS[ci].col;
    sctx.fillRect(Math.round(x - s/2), Math.round(y - s/2), s, s);
    if (s >= 3){
      sctx.globalAlpha = a*0.5;
      sctx.fillRect(Math.round(x - s/2 - 1), Math.round(y), 1, 1);
      sctx.fillRect(Math.round(x + s/2), Math.round(y), 1, 1);
      sctx.fillRect(Math.round(x), Math.round(y - s/2 - 1), 1, 1);
      sctx.fillRect(Math.round(x), Math.round(y + s/2), 1, 1);
    }
    sctx.globalAlpha = 1;
  }
  contractMarker(star){
    if(!this.world||!star||star.kind==="neb")return null;
    const contracts=contractsForSystem(this.world,systemId(this.g.def.seed,this.g.systemSeedOf(star)));
    if(!contracts.length)return null;
    const day=economicDay(this.world);
    if(contracts.some(contract=>contract.deadline<day))return "expired";
    if(contracts.some(contract=>contract.deadline-day<=1))return "urgent";
    return "active";
  }
  isPlayerSystem(star){
    const key=this.world?.data.location?.key;
    return !!key&&key===systemId(this.g.def.seed,this.g.systemSeedOf(star));
  }
  drawContractMarker(x,y,state="active"){
    /* A tiny amber bracket is legible at every galaxy LOD and does not expose
       price, cargo or black-market contracts before the player investigates. */
    const {sctx}=this.ctx,X=Math.round(x),Y=Math.round(y);
    sctx.fillStyle=state==="expired"?"#ff5c4d":state==="urgent"?"#ffc45c":"#7ee08a";
    sctx.fillRect(X+3,Y-4,2,2);
    if(state==="urgent")sctx.fillRect(X+4,Y-7,1,2);
    if(state==="expired")sctx.fillRect(X+3,Y-7,2,1);
  }
  drawPlayerMarker(x,y){
    const {sctx}=this.ctx,X=Math.round(x),Y=Math.round(y),r=6;
    sctx.fillStyle="#ffd166";
    sctx.fillRect(X-r,Y,3,1);sctx.fillRect(X+r-2,Y,3,1);
    sctx.fillRect(X,Y-r,1,3);sctx.fillRect(X,Y+r-2,1,3);
  }
  draw(t){
    const { sctx, SCR } = this.ctx;
    if (settings.dust > 0.02){
      sctx.save();
      sctx.translate(this.wsx(0), this.wsy(0));
      sctx.rotate(this.TH);
      const s = this.g.dustSpan*this.zoom;
      sctx.drawImage(this.g.dustCvs, Math.round(-s/2), Math.round(-s/2), Math.round(s), Math.round(s));
      sctx.restore();
    }
    /* туманности галактики: между пылью и звёздами */
    for(const nb of this.g.nebulae){
      const [dx, dy] = this.dispPt(nb.x, nb.y);
      const X = this.wsx(dx), Y = this.wsy(dy);
      const s = nb.R*2*this.zoom;
      if (X + s < 0 || Y + s < 0 || X - s > SCR || Y - s > SCR) continue;
      sctx.drawImage(bakeGalaxyNebSprite(nb), Math.round(X - s/2), Math.round(Y - s/2), Math.round(s), Math.round(s));
    }
    const lod = LODS[settings.lod];
    this.visSectors = 0; this.visStars = 0;
    const half = SCR/2/this.zoom;
    let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
    for(const [ex, ey] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const [gx, gy] = this.genPt(this.cam.x + ex*half, this.cam.y + ey*half);
      gx0 = Math.min(gx0, gx); gx1 = Math.max(gx1, gx);
      gy0 = Math.min(gy0, gy); gy1 = Math.max(gy1, gy);
    }
    const sx0 = Math.floor(gx0/SECT), sx1 = Math.floor(gx1/SECT);
    const sy0 = Math.floor(gy0/SECT), sy1 = Math.floor(gy1/SECT);
    const count = (sx1 - sx0 + 1)*(sy1 - sy0 + 1);
    if (this.zoom >= lod.secZoom && count <= lod.secCap){
      this.visSectors = count;
      for(let sy=sy0; sy<=sy1; sy++){
        for(let sx=sx0; sx<=sx1; sx++){
          for(const s of this.g.sectorStars(sx, sy)){
            const [dx, dy] = this.dispPt(s.x, s.y);
            const X = this.wsx(dx), Y = this.wsy(dy);
            if (X < -2 || Y < -2 || X > SCR+2 || Y > SCR+2) continue;
            this.drawStarPx(X, Y, s.ci, s.lum, s.ph, t);
            const marker=this.contractMarker(s);
            if(marker)this.drawContractMarker(X,Y,marker);
            if(this.isPlayerSystem(s))this.drawPlayerMarker(X,Y);
            this.visStars++;
          }
        }
      }
    }
    for(const b of this.g.beacons){
      const [dx, dy] = this.dispPt(b.x, b.y);
      const X = this.wsx(dx), Y = this.wsy(dy);
      if (X < -4 || Y < -4 || X > SCR+4 || Y > SCR+4) continue;
      this.drawStarPx(X, Y, b.ci, 1, b.ph, t);
      const marker=this.contractMarker(b);
      if(marker)this.drawContractMarker(X,Y,marker);
      if(this.isPlayerSystem(b))this.drawPlayerMarker(X,Y);
      this.visStars++;
    }
    for(const q of this.g.quasars){
      const [dx, dy] = this.dispPt(q.x, q.y);
      const X = Math.round(this.wsx(dx)), Y = Math.round(this.wsy(dy));
      if (X < -8 || Y < -8 || X > SCR+8 || Y > SCR+8) continue;
      const fl = 0.6 + 0.4*Math.sin(t*5 + q.ph);
      sctx.globalAlpha = this.clsFilter !== null ? 0.3 : 1;
      sctx.fillStyle = "#eaf6ff";
      sctx.fillRect(X-1, Y-1, 3, 3);
      const ja = q.jetAng + this.TH;
      const jc = Math.cos(ja), js = Math.sin(ja);
      sctx.fillStyle = "#8fd0ff";
      for(let k=2; k<7; k++){
        if ((k + Math.floor(t*8)) % 2) continue;
        sctx.globalAlpha = fl*(1 - k/8);
        sctx.fillRect(Math.round(X + jc*k), Math.round(Y + js*k), 1, 1);
        sctx.fillRect(Math.round(X - jc*k), Math.round(Y - js*k), 1, 1);
      }
      sctx.globalAlpha = 1;
    }
    if (this.g.coreBH){
      const X = this.wsx(0), Y = this.wsy(0);
      if (this.zoom > 1.1){
        renderBH(this.g.coreBH, t);
        const s = Math.max(10, Math.round(10*this.zoom*1.1));
        sctx.drawImage(this.g.coreBH.cvs, Math.round(X - s/2), Math.round(Y - s/2), s, s);
      } else {
        sctx.globalAlpha = 0.6 + 0.4*Math.sin(t*6.5);
        sctx.fillStyle = "#fff2d0";
        sctx.fillRect(Math.round(X)-1, Math.round(Y)-1, 3, 3);
        sctx.globalAlpha = 1;
      }
    }
    /* The current system can be a procedural sector star outside the current
     * LOD. Draw it explicitly so the player never loses their position. */
    const current=this.world?.data.location?.star;
    if(current&&current.kind!=="neb"){
      const [dx,dy]=this.dispPt(current.x,current.y),X=this.wsx(dx),Y=this.wsy(dy);
      if(X>-8&&Y>-8&&X<SCR+8&&Y<SCR+8)this.drawPlayerMarker(X,Y);
    }
    if (this.sel){
      const [sdx, sdy] = this.dispPt(this.sel.x, this.sel.y);
      const X = Math.round(this.wsx(sdx)), Y = Math.round(this.wsy(sdy));
      sctx.fillStyle = "#ffd166";
      const hr = 7;
      for(const [ox, oy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        sctx.fillRect(X + ox*hr - (ox<0?0:3), Y + oy*hr, 4, 1);
        sctx.fillRect(X + ox*hr, Y + oy*hr - (oy<0?0:3), 1, 4);
      }
    }
  }
  drawLabels(t){
    const { SCR } = this.ctx;
    if (settings.labels && this.zoom > 1.6){
      for(const b of this.g.beacons){
        const [dx, dy] = this.dispPt(b.x, b.y);
        const X = this.wsx(dx), Y = this.wsy(dy);
        if (X < 0 || Y < 0 || X > SCR || Y > SCR) continue;
        lblText(this.ctx, b.name, toLbl(this.ctx, X) + 8, toLbl(this.ctx, Y) - 6, "#aeb6e0", 11);
      }
    }
    if (settings.labels && this.zoom > 0.8){
      for(const nb of this.g.nebulae){
        const [dx, dy] = this.dispPt(nb.x, nb.y);
        const X = this.wsx(dx), Y = this.wsy(dy);
        if (X < 0 || Y < 0 || X > SCR || Y > SCR) continue;
        lblText(this.ctx, nb.name, toLbl(this.ctx, X) + 8, toLbl(this.ctx, Y) - 6, "#c9a0e8", 11);
      }
      for(const q of this.g.quasars){
        const [dx, dy] = this.dispPt(q.x, q.y);
        const X = this.wsx(dx), Y = this.wsy(dy);
        if (X < 0 || Y < 0 || X > SCR || Y > SCR) continue;
        lblText(this.ctx, q.name, toLbl(this.ctx, X) + 8, toLbl(this.ctx, Y) - 6, "#8fd0ff", 11);
      }
      if (this.g.def.smbh){
        const X = this.wsx(0), Y = this.wsy(0);
        if (X > 0 && Y > 0 && X < SCR && Y < SCR)
          lblText(this.ctx, this.g.name + " A*", toLbl(this.ctx, X) + 10, toLbl(this.ctx, Y) - 8, "#ffc45c", 11);
      }
    }
    if (this.sel){
      const [sdx, sdy] = this.dispPt(this.sel.x, this.sel.y);
      const X = this.wsx(sdx), Y = this.wsy(sdy);
      if (X > -20 && Y > -20 && X < SCR+20 && Y < SCR+20){
        lblText(this.ctx, this.sel.name || this.g.fieldName(this.sel),
          toLbl(this.ctx, X) + 12, toLbl(this.ctx, Y) + 18, "#ffd166", 13);
      }
    }
  }
  pick(dwx, dwy){
    const [wx, wy] = this.genPt(dwx, dwy);
    const th = 8/this.zoom;
    let best = null, bd = th;
    if (this.g.def.smbh){
      const d = Math.hypot(wx, wy);
      if (d < 6 + th){ bd = d; best = this.g.smbhObj(); }
    }
    for(const q of this.g.quasars){
      const d = Math.hypot(q.x - wx, q.y - wy);
      if (d < 5 + th && d < bd){ bd = d; best = q; }
    }
    for(const nb of this.g.nebulae){
      const d = Math.hypot(nb.x - wx, nb.y - wy);
      if (d < nb.R*0.6 && d < bd){ bd = d; best = nb; }
    }
    for(const b of this.g.beacons){
      const d = Math.hypot(b.x - wx, b.y - wy);
      if (d < bd){ bd = d; best = b; }
    }
    if (this.zoom >= LODS[settings.lod].secZoom){
      const sx = Math.floor(wx/SECT), sy = Math.floor(wy/SECT);
      for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
        for(const s of this.g.sectorStars(sx+dx, sy+dy)){
          const d = Math.hypot(s.x - wx, s.y - wy);
          if (d < bd){ bd = d; best = { ...s, name: this.g.fieldName(s), desig: this.g.fieldDesig(s) }; }
        }
      }
    }
    return best;
  }
  desigOf(o){ return o.desig || this.g.fieldDesig(o); }
  onTap(mx, my){
    const wx = (mx - this.ctx.SCR/2)/this.zoom + this.cam.x;
    const wy = (my - this.ctx.SCR/2)/this.zoom + this.cam.y;
    const hit = this.pick(wx, wy);
    if (!hit) return;
    if (this.sel && this.desigOf(this.sel) === this.desigOf(hit)){
      if (hit.kind !== "neb") this.tryJump(hit);
    } else {
      this.sel = hit;
      this.jumpMsg = null;
      this.mgr.onChange?.();
    }
  }
  jumpTo(s){
    this.sel = s;
    this.anchor = { x: s.x, y: s.y };
    this.camT.zoom = Math.max(this.camT.zoom, 3.2);
    this.mgr.onChange?.();
  }
  onDragStart(){ this.anchor = null; return { cx: this.cam.x, cy: this.cam.y }; }
  onDragMove(dx, dy, st){
    this.cam.x = st.cx - dx/this.zoom;
    this.cam.y = st.cy - dy/this.zoom;
    this.camT.x = this.cam.x; this.camT.y = this.cam.y; this.camT.zoom = this.zoom;
  }
  onWheel(mx, my, deltaY){
    const wx = (mx - this.ctx.SCR/2)/this.zoom + this.cam.x;
    const wy = (my - this.ctx.SCR/2)/this.zoom + this.cam.y;
    this.zoom = Math.min(8, Math.max(0.1, this.zoom * (deltaY < 0 ? 1.18 : 1/1.18)));
    this.cam.x = wx - (mx - this.ctx.SCR/2)/this.zoom;
    this.cam.y = wy - (my - this.ctx.SCR/2)/this.zoom;
    this.anchor = null;
    this.camT.x = this.cam.x; this.camT.y = this.cam.y; this.camT.zoom = this.zoom;
  }
  zoomBy(f){ this.camT.zoom = Math.min(8, Math.max(0.1, this.camT.zoom*f)); }
  status(){
    const [gcx, gcy] = this.genPt(this.cam.x, this.cam.y);
    const sx = Math.floor(gcx/SECT), sy = Math.floor(gcy/SECT);
    return {
      title: this.gal.name,
      info: ({spiral:"спиральная", globular:"шаровое скопление", elliptical:"эллиптическая"})[this.g.def.type] +
        " · каталог: " + this.g.beacons.length +
        " · сектор «" + this.g.sectorName(sx, sy) + "» (" + sx + "," + sy + ")" +
        " · ×" + this.zoom.toFixed(2) +
        (this.visSectors ? " · секторов: " + this.visSectors : "") +
        " · звёзд в кадре: " + this.visStars +
        (this.g.def.smbh ? " · ядро: ЧД" : "") + " · топливо: " + Math.round(player.fuel)
    };
  }
  selectedInfo(){
    const s = this.sel;
    if (!s) return { name:"—", detail:"кликните по звезде или найдите её в каталоге" };
    if (s.kind === "smbh")
      return { name: s.name + " · " + s.desig,
               detail: "сверхмассивная чёрная дыра · ядро галактики<br>аккреционный диск" };
    if (s.kind === "qso")
      return { name: s.name + " · " + s.desig,
               detail: "квазар · активное ядро, z ≈ " + s.z + "<br>релятивистские джеты" };
    if (s.kind === "neb")
      return { name: s.name + " · " + s.desig,
               detail: "эмиссионная туманность · Ø ≈ " + Math.round(s.R*2) +
                 "<br>сектор «" + this.g.sectorName(Math.floor(s.x/SECT), Math.floor(s.y/SECT)) + "»" };
    const cls = CLS[s.ci];
    const inf = this.g.starInfo(s);
    const rumor=this.tradeRumor(s);
    const jump = this.jumpMsg ? "<br><span style='color:#ff9a6b'>" + this.jumpMsg + "</span>" : "";
    return {
      name: (s.name || this.g.fieldName(s)) + " · " + this.desigOf(s),
      detail: jump + "класс " + cls.c + " (" + CLS_RU[cls.c] + ") · ≈" + cls.temp.toLocaleString("ru-RU") + " K" +
        "<br>сектор «" + this.g.sectorName(Math.floor(s.x/SECT), Math.floor(s.y/SECT)) + "»" +
        " · коорд: " + Math.round(s.x) + ", " + Math.round(s.y) +
        "<br>планет: " + inf.planets + (inf.belt ? " · пояс" : "") +
        (rumor ? "<br>" + rumor : "")
    };
  }
  /** Гиперпереход: проверка и расход топлива по дистанции между звёздами. */
  tryJump(star){
    const cost = player.jumpCost(this.g.def.seed, star.x, star.y),prop=player.shipProp;
    const status=prop?.hyperjumpStatus?.(cost);
    if(!status?.ok){
      const reason={"no-hyperdrive":"нужен гипердвигатель","no-capacitor":"нужен конденсатор","no-power":"нет питания","range":"цель вне дальности","energy":"недостаточно энергии","antimatter":"недостаточно антиматерии"}[status?.reason]||"нет корабля";
      this.jumpMsg=reason;this.mgr.onChange?.();return;
    }
    if(player.ship?.mode==="landed"||player.ship?.empTimer>0){this.jumpMsg="условия для прыжка небезопасны";this.mgr.onChange?.();return;}
    const key=`${star.x}:${star.y}`,now=Date.now();
    if(this.jumpPreparation?.key!==key){
      this.jumpPreparation={key,until:now+(status.prepare||0)*1000};
      this.jumpMsg=`подготовка гиперпрыжка: ${status.prepare||0} с`;this.mgr.onChange?.();return;
    }
    if(now<this.jumpPreparation.until){this.jumpMsg=`подготовка гиперпрыжка: ${Math.ceil((this.jumpPreparation.until-now)/1000)} с`;this.mgr.onChange?.();return;}
    this.jumpPreparation=null;
    if (player.fuel < cost){
      this.jumpMsg = "недостаточно топлива: нужно " + cost + ", есть " + Math.round(player.fuel) +
        " — сядьте на планету для заправки";
      this.mgr.onChange?.();
      return;
    }
    this.jumpMsg = null;
    prop.consumeHyperjump(cost);
    player.doJump(this.g.def.seed, star.x, star.y);
    // A jump advances one discrete game day. This is simulation logic, not a frame tick.
    if(this.world){
      economicTick(this.world,economicDay(this.world)+1);
      /* Events advance after shelves so their pressure becomes a persistent
         market deficit rather than a frame-dependent visual multiplier. */
      advanceWorldEvents(this.world,economicDay(this.world));
      advanceContracts(this.world,economicDay(this.world));
    }
    if(this.world)this.world.data.galaxyIndex=this.gal.idx;
    this.mgr.push(new SystemScene(this.g, star,{world:this.world}));
  }
  /** A rumour is intentionally qualitative: opening a map must not reveal
   * perfect prices for the entire galaxy. We build/cache only the selected
   * system and expose its strongest local specialization. */
  tradeRumor(star){
    if(!star || star.kind === "neb")return null;
    const key=this.g.systemSeedOf(star);
    if(this.tradeRumors.has(key))return this.tradeRumors.get(key);
    const system=buildSystem(this.g,star);
    const settlement=system.planets.find(planet=>planet.settlement)?.settlement||null;
    const count=settlement&&this.world?contractsAt(this.world,settlement.id).length:0;
    const event=settlement&&this.world?eventAt(this.world,settlement.id):null;
    const insight=settlement&&this.world?rumorInsight(this.world,settlement):null;
    const rumor=settlement?t("ui.tradeRumor",{specialization:t(`ui.specializations.${settlement.specialization}`)})+
      (insight?" · "+t(`progression.insights.${insight}`):"")+(event?" · "+t(`events.types.${event.type}`):"")+(count?" · "+t("ui.contractMarker",{count}):""):null;
    this.tradeRumors.set(key,rumor);return rumor;
  }
  primary(){
    if (this.sel && this.sel.kind === "neb")
      return { label:"Полёт к туманности", run: () => this.jumpTo(this.sel) };
    const cost = this.sel && this.sel.kind !== "neb"
      ? player.jumpCost(this.g.def.seed, this.sel.x, this.sel.y) : 0;
    return { label:"Гиперпереход" + (this.sel ? " (" + cost + " т)" : ""),
      run: () => { if (this.sel) this.tryJump(this.sel); } };
  }
  search(q){
    const qU = q.toUpperCase();
    const byCode = this.g.resolveCode(qU);
    const list = byCode ? [byCode] : this.g.searchPrefix(qU);
    return list.map(o => ({
      label: o.name,
      tag: (o.desig || "") + (o.ci !== undefined ? " · " + CLS[o.ci].c :
        (o.kind === "qso" ? " · QSO" : (o.kind === "neb" ? " · туманность" : " · ЧД"))),
      run: () => this.jumpTo(o)
    }));
  }
  panelSpec(){
    const d = this.g.def;
    const rb = () => this.rebuild();
    const spec = [];
    if(this.mgr?.returnToShip) spec.push({kind:"action",label:t("ui.goToShip"),run:()=>this.mgr.returnToShip()});
    spec.push(
      { kind:"range", label:"Радиус", min:500, max:1500, step:50, get:()=>d.R, set:v=>{d.R=v;}, commit:rb },
      { kind:"range", label:"Плотность", min:0.3, max:2, step:0.1, get:()=>d.dens, set:v=>{d.dens=v;}, commit:rb, fmt:v=>v.toFixed(1) },
      { kind:"range", label:"Молодое население", min:0, max:1, step:0.05, get:()=>d.blue, set:v=>{d.blue=v;}, commit:rb, fmt:v=>v.toFixed(2) }
    );
    if (d.type === "spiral"){
      spec.push(
        { kind:"range", label:"Рукава", min:1, max:6, step:1, get:()=>d.arms, set:v=>{d.arms=v;}, commit:rb },
        { kind:"range", label:"Закрутка", min:2, max:8, step:0.5, get:()=>d.swirl, set:v=>{d.swirl=v;}, commit:rb, fmt:v=>v.toFixed(1) },
        { kind:"range", label:"Резкость рукавов", min:1, max:7, step:0.5, get:()=>d.armW, set:v=>{d.armW=v;}, commit:rb, fmt:v=>v.toFixed(1) },
        { kind:"range", label:"Перемычка", min:0, max:0.5, step:0.05, get:()=>d.bar, set:v=>{d.bar=v;}, commit:rb, fmt:v=>v.toFixed(2) }
      );
    } else {
      spec.push(
        { kind:"range", label:"Концентрация", min:1.5, max:4, step:0.1, get:()=>d.conc, set:v=>{d.conc=v;}, commit:rb, fmt:v=>v.toFixed(1) },
        { kind:"range", label:"Сжатие", min:0.4, max:1, step:0.05, get:()=>d.flat, set:v=>{d.flat=v;}, commit:rb, fmt:v=>v.toFixed(2) }
      );
    }
    spec.push(
      { kind:"range", label:"Ядро", min:0.05, max:0.4, step:0.01, get:()=>d.core, set:v=>{d.core=v;}, commit:rb, fmt:v=>v.toFixed(2) },
      { kind:"check", label:"ЧД в ядре", get:()=>d.smbh, set:v=>{d.smbh=v; rb();} },
      { kind:"legend" }
    );
    return spec;
  }
  legendData(){
    const counts = new Array(CLS.length).fill(0);
    for(const b of this.g.beacons) counts[b.ci]++;
    return { counts, quasars: this.g.quasars.length, smbh: this.g.def.smbh,
             filter: this.clsFilter,
             toggle: i => { this.clsFilter = this.clsFilter === i ? null : i; this.mgr.onChange?.(); } };
  }
}
