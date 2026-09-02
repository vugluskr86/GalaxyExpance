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
  /** Return to an already opened point in the path without recreating it. */
  navigateTo(index){
    if(!Number.isInteger(index)||index<0||index>=this.stack.length)return false;
    if(index===this.stack.length-1)return true;
    this.current?.leave?.();
    this.stack.splice(index+1);
    this.current?.resume?.();
    this.onChange?.();
    return true;
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
  reasonText(reason){
    const key={
      "no-hyperdrive":"actionNeedHyperdrive", "no-capacitor":"actionNeedCapacitor",
      "no-power":"actionNeedPower", "overload":"actionOverloaded",
      "range":"actionOutOfRange", "energy":"actionNeedEnergy",
      "antimatter":"actionNeedAntimatter", "credits":"actionNeedCredits",
      "stock":"actionNoStock", "cargo":"actionNeedCargo", "capacity":"actionNoCapacity",
      "license":"actionNeedLicense", "illegal":"actionIllegal", "no-data":"actionNoData",
      "no-computer":"actionNeedComputer", "no-scanner":"actionNeedScanner",
      "no-miner":"actionNeedMiner", "unscanned":"actionNeedScan",
      "unavailable":"actionUnavailable"
    }[reason];
    return key?t(`ui.${key}`):String(reason||"").replaceAll("-"," ");
  }
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
      const reason=this.reasonText(result.message||result.reason);
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
