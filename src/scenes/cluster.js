import { GalaxyScene } from "./galaxy.js";
import { lblText, toLbl } from "../ui/panel.js";

export class ClusterScene {
  constructor(cluster){
    this.cluster = cluster;
    this.crumb = "Кластер";
    this.cam = { x:0, y:0 };
    this.zoom = 0.08;
    this.camT = { x:0, y:0, zoom:0.08 };
    this.sel = null;
  }
  enter(){ this.fit(); }
  fit(){ this.camT.x = 0; this.camT.y = 0; this.camT.zoom = this.ctx.SCR/(this.cluster.spread*1.3); }
  wsx(wx){ return (wx - this.cam.x)*this.zoom + this.ctx.SCR/2; }
  wsy(wy){ return (wy - this.cam.y)*this.zoom + this.ctx.SCR/2; }
  update(dt){
    const k = 1 - Math.exp(-dt*5);
    this.cam.x += (this.camT.x - this.cam.x)*k;
    this.cam.y += (this.camT.y - this.cam.y)*k;
    this.zoom += (this.camT.zoom - this.zoom)*k;
  }
  draw(t){
    const { sctx, SCR } = this.ctx;
    for(const g of this.cluster.galaxies){
      const X = this.wsx(g.x), Y = this.wsy(g.y);
      const s = Math.max(4, Math.round(g.rv*2.4*this.zoom*3.2));
      if (X + s < 0 || Y + s < 0 || X - s > SCR || Y - s > SCR) continue;
      sctx.globalAlpha = 0.85 + 0.15*Math.sin(t*0.7 + g.ph);
      sctx.drawImage(this.cluster.thumb(g), Math.round(X - s/2), Math.round(Y - s/2), s, s);
      sctx.globalAlpha = 1;
    }
    if (this.sel){
      const X = Math.round(this.wsx(this.sel.x)), Y = Math.round(this.wsy(this.sel.y));
      const hr = Math.round(this.sel.rv*this.zoom + 7);
      sctx.fillStyle = "#ffd166";
      for(const [ox, oy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        sctx.fillRect(X + ox*hr - (ox<0?0:3), Y + oy*hr, 4, 1);
        sctx.fillRect(X + ox*hr, Y + oy*hr - (oy<0?0:3), 1, 4);
      }
    }
  }
  drawLabels(){
    const { SCR } = this.ctx;
    if (this.zoom > 0.05){
      for(const g of this.cluster.galaxies){
        const X = this.wsx(g.x), Y = this.wsy(g.y);
        if (X < 0 || Y < 0 || X > SCR || Y > SCR) continue;
        lblText(this.ctx, g.name.replace("Галактика ", ""), toLbl(this.ctx, X) + 8, toLbl(this.ctx, Y) - 6, "#aeb6e0", 11);
      }
    }
    if (this.sel){
      const X = this.wsx(this.sel.x), Y = this.wsy(this.sel.y);
      lblText(this.ctx, this.sel.name, toLbl(this.ctx, X) + 12, toLbl(this.ctx, Y) + 20, "#ffd166", 13);
    }
  }
  pick(wx, wy){
    let best = null, bd = 1e9;
    for(const g of this.cluster.galaxies){
      const d = Math.hypot(g.x - wx, g.y - wy);
      if (d < g.rv + 14/this.zoom && d < bd){ bd = d; best = g; }
    }
    return best;
  }
  onTap(mx, my){
    const wx = (mx - this.ctx.SCR/2)/this.zoom + this.cam.x;
    const wy = (my - this.ctx.SCR/2)/this.zoom + this.cam.y;
    const hit = this.pick(wx, wy);
    if (!hit) return;
    if (this.sel === hit) this.enterGalaxy(hit);
    else { this.sel = hit; this.mgr.onChange?.(); }
  }
  enterGalaxy(g){ this.mgr.push(new GalaxyScene(g)); }
  onDragStart(){ return { cx: this.cam.x, cy: this.cam.y }; }
  onDragMove(dx, dy, st){
    this.cam.x = st.cx - dx/this.zoom;
    this.cam.y = st.cy - dy/this.zoom;
    this.camT.x = this.cam.x; this.camT.y = this.cam.y; this.camT.zoom = this.zoom;
  }
  onWheel(mx, my, deltaY){
    const wx = (mx - this.ctx.SCR/2)/this.zoom + this.cam.x;
    const wy = (my - this.ctx.SCR/2)/this.zoom + this.cam.y;
    this.zoom = Math.min(1.2, Math.max(0.03, this.zoom * (deltaY < 0 ? 1.18 : 1/1.18)));
    this.cam.x = wx - (mx - this.ctx.SCR/2)/this.zoom;
    this.cam.y = wy - (my - this.ctx.SCR/2)/this.zoom;
    this.camT.x = this.cam.x; this.camT.y = this.cam.y; this.camT.zoom = this.zoom;
  }
  zoomBy(f){ this.camT.zoom = Math.min(1.2, Math.max(0.03, this.camT.zoom*f)); }
  status(){
    return {
      title: this.cluster.name,
      info: "галактик: " + this.cluster.galaxies.length + " · ×" + this.zoom.toFixed(3)
    };
  }
  selectedInfo(){
    if (!this.sel) return { name:"—", detail:"кликните по галактике или найдите её в каталоге" };
    const d = this.sel.def;
    const typeRu = { spiral:"спиральная", globular:"шаровое скопление", elliptical:"эллиптическая" }[d.type];
    return {
      name: this.sel.name + " · " + this.sel.desig,
      detail: typeRu + " · R=" + d.R + (d.type === "spiral" ? " · рукавов: " + d.arms : "") +
        (d.smbh ? " · ЧД в ядре" : "") + "<br>зерно: " + d.seed
    };
  }
  primary(){
    return { label: "Войти в галактику", run: () => { if (this.sel) this.enterGalaxy(this.sel); } };
  }
  search(q){
    const res = this.cluster.searchPrefix(q.toUpperCase());
    return res.map(g => ({
      label: g.name, tag: g.desig,
      run: () => {
        this.sel = g;
        this.camT.x = g.x; this.camT.y = g.y;
        this.camT.zoom = Math.max(this.camT.zoom, 0.25);
        this.mgr.onChange?.();
      }
    }));
  }
  panelSpec(){
    return [
      { kind:"seed", label:"Зерно кластера", get:() => this.cluster.seed,
        set:(v) => { this.cluster.setSeed(v); this.sel = null; this.fit(); } },
      { kind:"range", label:"Галактик", min:8, max:60, step:1,
        get:() => this.cluster.count,
        set:(v) => { this.cluster.count = v; this.cluster.build(); this.sel = null; } },
      { kind:"range", label:"Разброс", min:2000, max:8000, step:200,
        get:() => this.cluster.spread,
        set:(v) => { this.cluster.spread = v; this.cluster.build(); this.sel = null; this.fit(); } }
    ];
  }
}
