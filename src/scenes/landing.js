import { createLandingViewRenderer } from "../gen/landing-view-renderer.generated.js";
import { player } from "../game/player.js";
import { lblText } from "../ui/panel.js";
import { t } from "../i18n/index.js";
import { TradeScene } from "./trade.js";
import { StationScene } from "./station.js";
import { OutfitScene } from "./outfit.js";
import { BalanceLabScene } from "./balance-lab.js";
import { configValue } from "../config/balance.js";
import { communicationStatus, equipmentReason } from "../game/equipment.js";

const PRESETS_KEY="landing:presets";
const clone=value=>JSON.parse(JSON.stringify(value));

function loadPresets(){
  try{
    const saved=globalThis.localStorage?.getItem(PRESETS_KEY);
    const parsed=saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }catch{ return {}; }
}
function storePresets(presets){
  try{ globalThis.localStorage?.setItem(PRESETS_KEY,JSON.stringify(presets)); }catch{}
}
function download(name, source){
  const anchor=document.createElement("a");
  anchor.download=name;
  anchor.href=source instanceof Blob ? URL.createObjectURL(source) : source;
  anchor.click();
  if(source instanceof Blob) setTimeout(()=>URL.revokeObjectURL(anchor.href),0);
}

function fallbackSurface(sys,stats={}){
  return {
    tempK:(stats.tempC||0)+273,pressure:stats.hasAtm?1:0,gravity:Number(stats.grav)||1,
    starT:sys.S.sun.temp,starLum:1,orbitAU:1,gN2:.78,gO2:.21,gCO2:.01,gCH4:0,gSO2:0,gH2O:.01,
    dust:0,haze:0,wind:.2,liquid:0,liquidType:"none",humidity:0,vegetation:0,flora:110,
    volcanism:0,minerals:.4,magnetic:0,relief:.5,roughness:.5,cloudCover:0,cloudHeight:.4,
    cloudSpeed:.5,plantDensity:0,plantSize:1,colony:0
  };
}

/** Landing view.  The whole canvas is delegated to SurfaceRenderer, which is
 * the adapted renderer from the supplied surface-generator reference. */
export class LandingScene {
  constructor(sys,selRef,stats,options={}){
    this.sys=sys; this.selRef=selRef; this.stats=stats; this.crumb=t("ui.surface");
    this.p=sys.obj(selRef);
    this.surface=this.p.surface||fallbackSurface(sys,stats);
    this.p.surface=this.surface;
    const seed=(this.surface.seed??this.p.seed??this.p.rseed??((this.p.id||1)*77))|0;
    /* Render at the game's native canvas size.  No low-resolution frame is
     * stretched into the viewport. */
    this.surfaceCanvas=document.createElement("canvas");
    const canvasSize=configValue("surface.canvasSize");
    this.surfaceCanvas.width=canvasSize; this.surfaceCanvas.height=canvasSize;
    this.surfaceCtx=this.surfaceCanvas.getContext("2d");
    this.rebuildRenderer({ seed, moons:this.p.moonList?.length||0, rings:!!this.p.rings });
    this.landingPhase0=this.dayPhase();
    /* Refuelling belongs to the real landing transition only. Reconstructing
       this scene from a save must never grant fuel for free. */
    if(options.arrival){player.refuel();sys.playerShip?.prop.refuel();}
  }
  update(dt){this.sys.update(dt);}
  rebuildRenderer(extra={}){
    Object.assign(this.surface,extra);
    this.p.surface=this.surface;
    this.renderer=createLandingViewRenderer(this.surfaceCanvas,this.surface);
  }
  currentProfile(){ return clone(this.renderer.profile); }
  presetMap(){ return loadPresets(); }
  surfaceNotice(message){
    if(message !== undefined) this._surfaceNotice=message;
    return this._surfaceNotice||"";
  }
  savePreset(rawName){
    const profile=this.currentProfile();
    const name=rawName.trim() || t("ui.surfacePresetDefault",{seed:profile.seed});
    const presets=this.presetMap();
    presets[name]=profile;
    storePresets(presets);
    this.surfaceNotice(t("ui.surfacePresetSaved",{name}));
  }
  loadPreset(name){
    const profile=this.presetMap()[name];
    if(!profile) return;
    this.applyProfile(profile);
    this.surfaceNotice(t("ui.surfacePresetLoaded",{name}));
  }
  removePreset(name){
    const presets=this.presetMap();
    delete presets[name];
    storePresets(presets);
  }
  copyProfile(){
    navigator.clipboard?.writeText(JSON.stringify(this.currentProfile(),null,2)).then(
      ()=>{this.surfaceNotice(t("ui.surfaceCopied"));this.mgr.onChange?.();},
      ()=>{this.surfaceNotice(t("ui.surfaceCopyFailed"));this.mgr.onChange?.();}
    );
  }
  exportProfiles(){
    const payload={presets:this.presetMap(),current:this.currentProfile()};
    download("landing-presets.json",new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
    this.surfaceNotice(t("ui.surfaceExported"));
    this.mgr.onChange?.();
  }
  importProfiles(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const payload=JSON.parse(reader.result);
        if(!payload || typeof payload!=="object") throw new Error("invalid profile");
        const presets=this.presetMap();
        if(payload.presets && typeof payload.presets==="object") Object.assign(presets,payload.presets);
        storePresets(presets);
        if(payload.current && typeof payload.current==="object") this.applyProfile(payload.current);
        this.surfaceNotice(t("ui.surfaceImported"));
      }catch{
        this.surfaceNotice(t("ui.surfaceImportFailed"));
      }
      this.mgr.onChange?.();
    };
    reader.readAsText(file);
  }
  applyProfile(profile){
    Object.assign(this.surface,clone(profile));
    this.rebuildRenderer();
  }
  dayPhase(){
    const k=this.selRef.kind;
    const src=k==="comet"?this.p.th:(k==="rock"?this.p.ang:this.p.rot);
    return ((src%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  }
  draw(t){
    /* A new landing begins in local daylight, then follows the world's
     * rotation.  It avoids a random first frame being an unreadable polar night. */
    const phase=Math.PI/2+(this.dayPhase()-this.landingPhase0);
    this.renderer.render(t,phase);
    this.ctx.sctx.drawImage(this.surfaceCanvas,0,0);
  }
  drawLabels(){
    const hours=((this.dayPhase()/(Math.PI*2))*24+6)%24;
    const hh=String(Math.floor(hours)).padStart(2,"0"),mm=String(Math.floor((hours%1)*60)).padStart(2,"0");
    lblText(this.ctx,t("ui.localTime")+" "+hh+":"+mm+" · T "+(this.stats.tempC>0?"+":"")+this.stats.tempC+
      " °C · "+this.stats.pressure+" · "+this.renderer.weather,12,this.ctx.LW-14,"#dfe4ff",12);
  }
  status(){return {title:this.sys.label(this.selRef)+" · поверхность",info:this.stats.typeRu+" · "+this.stats.atm+" · заправлено (топливо 100)"};}
  selectedInfo(){
    const st=this.stats,q=this.surface;
    return {name:this.sys.label(this.selRef),detail:"T ср: "+(st.tempC>0?"+":"")+st.tempC+" °C · "+st.pressure+
      "<br>жидкость: "+st.liquid+" · облачность: "+Math.round(q.cloudCover*100)+"%"+
      "<br>рельеф: "+Math.round(q.relief*100)+"% · погода: "+this.renderer.weather};
  }
  primary(){return {label:t("ui.takeoff"),run:()=>{
    const ship=this.sys.playerShip;
    if(ship&&!ship.takeoff(this.sys,this.sys.orbitAlt)){
      this.mgr?.notify(t("ui.takeoffOverloaded"),{level:"error"});
      this.mgr.onChange?.();
      return false;
    }
    if(this.sys.world){this.sys.world.capture(this.sys);this.sys.world.persist();}
    this.mgr.pop();
    return true;
  }};}
  panelSpec(){
    const comm=communicationStatus(this.sys.playerShip?.prop,0);
    const spec=[
      /* This is navigation only: the ship remains landed and the LandingScene
       * stays on the stack, so Back returns to exactly the same surface. */
      {kind:"action",label:t("ui.toShip"),run:()=>{this.mgr.push(new OutfitScene(this.sys));return true;}},
      {kind:"action",label:t("ui.balanceLab"),run:()=>{this.mgr.push(new BalanceLabScene(this.sys));return true;}},
      ...(this.p.settlement&&comm.ok ? [
        {kind:"action",label:t("ui.tradeCenter"),run:()=>this.mgr.push(new TradeScene(this.sys,this.selRef))},
        {kind:"action",label:t("ui.stationServices"),run:()=>this.mgr.push(new StationScene(this.sys,this.selRef))}
      ] : this.p.settlement ? [{kind:"readout",label:"Связь",value:"Поселение недоступно: "+equipmentReason(comm.reason)}] : []),
      {kind:"sect",label:t("ui.surfaceProfiles")},
      {kind:"surfaceProfile",
        namePlaceholder:t("ui.surfacePresetName"), saveLabel:t("ui.save"), copyLabel:t("ui.copyJson"),
        exportLabel:t("ui.exportFile"), importLabel:t("ui.importFile"), loadLabel:t("ui.load"),
        deleteLabel:t("ui.delete"), emptyLabel:t("ui.noPresets"),
        presets:()=>Object.keys(this.presetMap()), save:name=>this.savePreset(name), load:name=>this.loadPreset(name),
        remove:name=>this.removePreset(name), copy:()=>this.copyProfile(), export:()=>this.exportProfiles(),
        import:file=>this.importProfiles(file), notice:()=>this.surfaceNotice()
      }
    ];
    return spec;
  }
}
