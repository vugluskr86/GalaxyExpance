import { t } from "../i18n/index.js";
import { TradeScene } from "./trade.js";
import { buyProbeAtStation, buyResearchDirectory, buyResearchMap, governmentReport, installStationModule, repairAtStation, refuelAtStation, sellDataAtStation, stationCatalog, stationsForSettlement, surveyAtStation, buyMilitaryLicense } from "../game/stations.js";
import { eventAt, resolveWorldEvent, worldNews } from "../game/events.js";
import { ProgressionScene } from "./progression.js";

/**
 * Dock service directory. The scene contains no prices, inventories or access
 * rules: it only presents the deterministic station list and delegates every
 * mutation to game/stations.js. This keeps the same service usable from a
 * future orbital-station scene without copying economy code.
 */
export class StationScene {
  constructor(systemScene,selRef){
    this.sys=systemScene;this.selRef={...selRef};this.body=systemScene.obj(selRef);
    this.settlement=this.body?.settlement||null;this.context={settlement:this.settlement,body:this.body};
    this.stations=this.settlement?.stations||stationsForSettlement(this.settlement);
    this.selected=this.stations[0]||null;this.crumb=t("ui.stationServices");this.message="";
  }
  get ship(){return this.sys.playerShip;}
  stationName(station){return t(`ui.stationKinds.${station.kind}`);}
  persist(){this.sys.world.capture(this.sys);this.sys.world.persist();}
  select(station){this.selected=station;this.message="";}
  perform(action){
    const station=this.selected;if(!station||!this.ship)return;
    let result;
    if(action==="repair")result=repairAtStation(this.sys.world,station,this.context,this.ship,{droidService:station.kind==="medical"});
    else if(action==="refuel")result=refuelAtStation(this.sys.world,station,this.ship);
    else if(action==="license")result=buyMilitaryLicense(this.sys.world,this.context);
    else if(action==="survey")result=surveyAtStation(this.sys.world,station,this.context,this.body);
    else if(action==="probe")result=buyProbeAtStation(this.sys.world,station,this.ship);
    else if(action==="data")result=sellDataAtStation(this.sys.world,station,this.context);
    else if(action==="directory")result=buyResearchDirectory(this.sys.world,station);
    else if(action==="map")result=buyResearchMap(this.sys.world,station,this.sys);
    if(result?.ok){
      this.persist();
      this.message=action==="probe"?t("stations.probeResult",result):action==="data"?t("scan.dataSold",result):action==="directory"?t("scan.directoryBought",result):action==="map"?t("scan.mapBought",result):t(`ui.stationResult.${action}`,result);
    }
    else this.message=result?.reason==="capacity"?t("ui.tradeError.capacity"):result?.reason==="no-data"?t("scan.directoryEmpty"):t(`ui.stationError.${result?.reason||"unavailable"}`);
    this.mgr?.onChange?.();
  }
  resolveEvent(action){
    const result=resolveWorldEvent(this.sys.world,this.settlement.id,this.context,this.ship?.prop,action);
    if(result.ok){this.persist();this.message=t("events.resolved",{action:t(`events.actions.${action}`)});}
    else this.message=t(`events.error.${result.reason||"unavailable"}`);
    this.mgr?.onChange?.();
  }
  install(itemId){
    const result=installStationModule(this.sys.world,this.selected,this.context,this.ship,itemId);
    if(result.ok){this.persist();this.message=t("ui.stationResult.install",{name:result.item.name,price:result.price});}
    else this.message=t(`ui.stationError.${result.reason||"unavailable"}`);
    this.mgr?.onChange?.();
  }
  openMarket(kind="public"){
    const scene=new TradeScene(this.sys,this.selRef,kind);this.mgr.push(scene);
  }
  openProgression(){this.mgr.push(new ProgressionScene(this.sys,this.context));}
  update(dt){this.sys.update(dt);}
  draw(time){
    this.sys.draw(time);
    const {sctx,SCR}=this.ctx;
    sctx.fillStyle="rgba(4,8,18,.82)";sctx.fillRect(18,84,SCR-36,252);
    sctx.strokeStyle="#5b78a6";sctx.strokeRect(18.5,84.5,SCR-37,251);
    sctx.fillStyle="#d9e7ff";sctx.font="13px 'Courier New', monospace";sctx.fillText(t("ui.stationServices"),32,110);
    sctx.fillStyle="#7ee08a";sctx.font="10px 'Courier New', monospace";
    sctx.fillText(this.selected?this.stationName(this.selected):t("ui.noServices"),32,128);
  }
  drawLabels(){}
  status(){return {title:t("ui.stationServices"),info:t("ui.stationStatus",{count:this.stations.length,specialization:t(`ui.specializations.${this.settlement?.specialization||"general"}`)})};}
  selectedInfo(){return {name:this.selected?this.stationName(this.selected):"—",detail:this.message||t(`ui.stationDescriptions.${this.selected?.kind||"trade"}`)};}
  primary(){return {label:t("ui.backToSurface"),run:()=>this.mgr.pop()};}
  stationActions(){
    const kind=this.selected?.kind;
    if(kind==="trade")return [{label:t("ui.openMarket"),run:()=>this.openMarket()}];
    if(kind==="pirate")return [{label:t("ui.blackMarket"),run:()=>this.openMarket("black")}];
    const actions=[];
    if(kind==="shipyard"||kind==="medical")actions.push({label:t("ui.stationRepair"),run:()=>this.perform("repair")});
    if(kind==="shipyard")actions.push({label:t("ui.stationRefuel"),run:()=>this.perform("refuel")});
    if(kind==="military")actions.push({label:t("ui.stationLicense"),run:()=>this.perform("license")});
    if(kind==="science")actions.push({label:t("ui.stationSurvey"),run:()=>this.perform("survey")},{label:t("stations.buyProbe"),run:()=>this.perform("probe")});
    if(["science","government"].includes(kind))actions.push(
      {label:t("scan.sellData"),run:()=>this.perform("data")},
      {label:t("scan.buyDirectory"),run:()=>this.perform("directory")},
      {label:t("scan.buyMap"),run:()=>this.perform("map")}
    );
    if(["military","science","medical","government"].includes(kind))actions.push({label:t("stations.contractBoard"),run:()=>this.openMarket()});
    if(kind==="government")actions.push({label:t("progression.open"),run:()=>this.openProgression()});
    return actions;
  }
  panelSpec(){
    if(!this.settlement||!this.selected)return [];
    const modules=stationCatalog(this.selected.kind).map(item=>({
      // stationCatalog returns immutable CATALOG definitions, not Item objects;
      // Item.tag is a getter, so build the same class/rating badge explicitly.
      tag:`${item.cls??"?"}${item.rating??"?"}`,label:item.name,note:t("ui.stationModulePrice",{price:Math.round(item.price)}),
      sub:t("ui.stationInstallHint"),actions:[{label:t("ui.stationInstall"),run:()=>this.install(item.id)}]
    }));
    const report=this.selected.kind==="government"?governmentReport(this.sys.world,this.context):null;
    const news=report?worldNews(this.sys.world).slice(0,5):[];
    const event=eventAt(this.sys.world,this.settlement.id);
    return [
      {kind:"sect",label:t("ui.stationDirectory")},
      {kind:"buttons",items:this.stations.map(station=>({label:this.stationName(station),sel:station.id===this.selected.id,run:()=>this.select(station)}))},
      {kind:"readout",label:t("ui.credits"),value:t("ui.creditsValue",{credits:this.sys.world?.data.economy?.credits||0,day:this.sys.world?.data.economy?.day||0})},
      {kind:"readout",label:t("ui.stationLevel"),value:t("ui.stationLevelValue",{level:this.selected.level})},
      {kind:"buttons",items:this.stationActions()},
      ...(event?[{kind:"sect",label:t("events.active")},{kind:"readout",label:t(`events.types.${event.type}`),value:t("events.summary",{severity:Math.round(event.severity*100),until:event.endDay,requirement:t(`ui.goods.${event.requirement}`)})},{kind:"buttons",items:event.actions.filter(action=>action!=="combat").map(action=>({label:t(`events.actions.${action}`),run:()=>this.resolveEvent(action)}))}]:[]),
      ...(report?[{kind:"readout",label:t("ui.reputation"),value:t("ui.reputationValue",{planet:report.rep.settlement,faction:report.rep.faction,merchant:report.rep.careers.merchant,protector:report.rep.careers.protector,pirate:report.rep.careers.pirate,researcher:report.rep.careers.researcher})},{kind:"readout",label:t("ui.stationAchievements"),value:report.achievements.length?report.achievements.map(item=>t(`ui.stationAchievement.${item}`)).join(" · "):t("ui.stationNoAchievements")}]:[]),
      ...(report?[{kind:"readout",label:t("events.newsTitle"),value:news.length?news.map(entry=>t(`events.news.${entry.type}`,{event:t(`events.types.${entry.eventType}`),action:entry.action?t(`events.actions.${entry.action}`):""})).join("<br>"):t("events.noNews")}]:[]),
      ...(modules.length?[{kind:"sect",label:t("ui.stationEquipment")},{kind:"rows",items:modules,empty:t("ui.noServices")}]:[])
    ];
  }
}
