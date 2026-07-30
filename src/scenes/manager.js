import { t } from "../i18n/index.js";

/** Стек сцен: Cluster → Galaxy → System → Body.
 *  Каждая сцена реализует: enter?, update(dt,t), draw(t), drawLabels?(t),
 *  onTap?(mx,my), onDragStart?/onDragMove?, onWheel?, fit?(), zoomBy?(f),
 *  status() → {title, info}, panelSpec() → секции панели, primary() → {label, run}, search?(q). */
export class SceneManager {
  constructor(ctx){
    this.ctx = ctx;          // { scene, sctx, lbl, lctx, SCR, LW }
    this.stack = [];
    this.onChange = null;
    this.onNotice = null;
    this.notice = null;
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
    this.current?.leave?.();
    this.stack.pop();
    this.current?.resume?.();
    this.onChange?.();
  }
  /** Replace the navigation path while keeping scenes attached to shared canvases. */
  setStack(scenes){
    this.current?.leave?.();
    this.stack = scenes;
    for(const scene of scenes){ scene.mgr = this; scene.ctx = this.ctx; }
    /* A normal push enters every path segment. Rebuilding a path must do the
     * same: GalaxyScene.enter() bakes its dust/spiral-arm layer even when the
     * SystemScene is the only immediately visible scene. */
    for(const scene of scenes) scene.enter?.();
    this.onChange?.();
  }
  crumbs(){ return this.stack.map(s => s.crumb || "?"); }
  /** A user action must never fail only in the browser console or through a
   * discarded false return.  Scenes and Panel use this one visible channel
   * for requirements, warnings and unexpected errors. */
  notify(message,{level="info",timeout=5000}={}){
    if(!message)return null;
    const notice={id:Date.now()+Math.random(),message:String(message),level,timeout};
    this.notice=notice;
    this.onNotice?.(notice);
    return notice;
  }
  actionResult(result,{fallback=null}={}){
    if(result?.ok===false){
      const reason=String(result.message||result.reason||"").replaceAll("-"," ");
      this.notify(reason?t("ui.actionFailedReason",{reason}):t("ui.actionUnavailable"),{level:"error"});
      return false;
    }
    if(result===false){
      this.notify(fallback||t("ui.actionUnavailable"),{level:"warning"});
      return false;
    }
    return true;
  }
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
