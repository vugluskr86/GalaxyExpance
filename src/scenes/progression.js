import { t } from "../i18n/index.js";
import { changeCredits } from "../game/economy.js";
import { availableCrew, hireCrew, progressionSummary } from "../game/progression.js";

/** Government-terminal view of the player's durable career, not a second XP system. */
export class ProgressionScene {
  constructor(systemScene,context={}){this.sys=systemScene;this.context=context;this.crumb=t("progression.title");this.message="";}
  persist(){this.sys.world.capture(this.sys);this.sys.world.persist();}
  hire(id){
    const result=hireCrew(this.sys.world,id,cost=>!!changeCredits(this.sys.world,-cost,{kind:"crew-hire",locationId:this.context.settlement?.id,note:id}));
    if(result.ok){this.persist();this.message=t("progression.hired",{name:t(`progression.crew.${id}`)});}
    else this.message=t(`progression.error.${result.reason||"unavailable"}`);
    this.mgr?.onChange?.();
  }
  update(dt){this.sys.update(dt);}
  draw(time){this.sys.draw(time);}
  drawLabels(){}
  status(){return {title:t("progression.title"),info:t("progression.status")};}
  selectedInfo(){return {name:t("progression.title"),detail:this.message||t("progression.hint")};}
  primary(){return {label:t("ui.backToSurface"),run:()=>this.mgr.pop()};}
  panelSpec(){
    const summary=progressionSummary(this.sys.world);
    const skillRows=Object.entries(summary.skills).map(([skill,value])=>({tag:`L${value.level}`,label:t(`progression.skills.${skill}`),note:t("progression.skillProgress",{xp:value.xp,next:value.next??t("progression.max")}),sub:t(`progression.skillEffect.${skill}`)}));
    const crewRows=availableCrew(this.sys.world).map(crew=>({tag:`L${crew.level}`,label:t(`progression.crew.${crew.id}`),note:t("progression.crewCost",{cost:crew.cost}),sub:t(`progression.crewEffect.${crew.id}`),actions:[{label:t("progression.hire"),run:()=>this.hire(crew.id)}]}));
    const hired=summary.crew.map(id=>t(`progression.crew.${id}`)).join(" · ")||t("progression.noCrew");
    const statLines=Object.entries(summary.stats).map(([name,value])=>`${t(`progression.stats.${name}`)}: ${value}`).join("<br>")||t("progression.noStats");
    const history=summary.history.filter(entry=>entry.type!=="skill"||entry.after>entry.before).slice(0,6).map(entry=>entry.type==="skill"?t("progression.levelUp",{skill:t(`progression.skills.${entry.skill}`),level:entry.after}):entry.type==="crew"?t("progression.hired",{name:t(`progression.crew.${entry.id}`)}):t("progression.historyStat",{name:t(`progression.stats.${entry.name}`),amount:entry.amount})).join("<br>")||t("progression.noHistory");
    return [
      {kind:"sect",label:t("progression.skillsTitle")},{kind:"rows",items:skillRows,empty:t("ui.empty")},
      {kind:"readout",label:t("ui.credits"),value:t("ui.creditsValue",{credits:this.sys.world?.data.economy?.credits||0,day:this.sys.world?.data.economy?.day||0})},
      {kind:"readout",label:t("progression.statistics"),value:statLines},
      {kind:"readout",label:t("progression.crewTitle"),value:hired},
      {kind:"rows",items:crewRows,empty:t("progression.noCrewOffers")},
      {kind:"readout",label:t("progression.historyTitle"),value:history}
    ];
  }
}
