/** Стек сцен: Cluster → Galaxy → System → Body.
 *  Каждая сцена реализует: enter?, update(dt,t), draw(t), drawLabels?(t),
 *  onTap?(mx,my), onDragStart?/onDragMove?, onWheel?, fit?(), zoomBy?(f),
 *  status() → {title, info}, panelSpec() → секции панели, primary() → {label, run}, search?(q). */
export class SceneManager {
  constructor(ctx){
    this.ctx = ctx;          // { scene, sctx, lbl, lctx, SCR, LW }
    this.stack = [];
    this.onChange = null;
  }
  get current(){ return this.stack[this.stack.length - 1] || null; }
  push(scene){
    scene.mgr = this; scene.ctx = this.ctx;
    this.stack.push(scene);
    scene.enter?.();
    this.onChange?.();
  }
  pop(){
    if (this.stack.length <= 1) return;
    this.stack.pop();
    this.current?.resume?.();
    this.onChange?.();
  }
  crumbs(){ return this.stack.map(s => s.crumb || "?"); }
  update(dt, t){ this.current?.update?.(dt, t); }
  draw(t){
    const s = this.current;
    if (!s) return;
    const { sctx, SCR } = this.ctx;
    sctx.clearRect(0, 0, SCR, SCR);
    sctx.imageSmoothingEnabled = false;
    s.draw(t);
    const { lctx, LW } = this.ctx;
    lctx.clearRect(0, 0, LW, LW);
    s.drawLabels?.(t);
  }
}
