import { configEntries, exportConfig, importConfig, resetConfig, saveConfigPreset, setConfig } from "../config/balance.js";
import { sampleTelemetry, telemetrySnapshot } from "../game/telemetry.js";
import { t } from "../i18n/index.js";

const domains=["economy","effects","render","telemetry"];
const download=(name,text)=>{const a=document.createElement("a");a.download=name;a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);};
/** Developer balance workbench. It deliberately reads the live SystemScene so
 * ship, surface, economy and NPC figures are never a second mock simulation. */
export class BalanceLabScene {
  constructor(systemScene){this.sys=systemScene;this.crumb=t("ui.balanceLab");this.tab="overview";this.domain="economy";this.elapsed=0;}
  update(dt){this.sys.update(dt);this.elapsed+=Math.max(0,dt);if(this.sys.world&&this.elapsed>=1){sampleTelemetry(this.sys.world,this.sys);this.elapsed=0;}}
  draw(time){
    this.sys.draw(time);const {sctx,SCR}=this.ctx,stats=this.stats(),samples=(this.sys.world?telemetrySnapshot(this.sys.world).samples:[]).slice(-32);
    sctx.fillStyle="rgba(3,9,18,.92)";sctx.fillRect(14,62,SCR-28,270);sctx.strokeStyle="#5b78a6";sctx.strokeRect(14.5,62.5,SCR-29,269);
    sctx.fillStyle="#ffd166";sctx.font="12px 'Courier New',monospace";sctx.fillText(t("ui.balanceLab"),28,86);
    sctx.fillStyle="#d7e8ff";sctx.font="10px 'Courier New',monospace";sctx.fillText(`${t("ui.balanceWorld")}: ${stats.day} d · ${stats.credits} cr`,28,108);
    sctx.fillText(`${t("ui.balanceShip")}: ${stats.cargoMass.toFixed(1)}/${stats.cargoCap.toFixed(1)} t · ${stats.energy.toFixed(0)} E`,28,125);
    sctx.fillText(`${t("ui.balanceSurface")}: ${stats.planets} · NPC ${stats.npcs} · FX ${stats.particles}`,28,142);
    const left=30,bottom=305,width=355,height=135,max=Math.max(1,...samples.map(sample=>sample.credits));
    sctx.strokeStyle="#294667";sctx.strokeRect(left,bottom-height,width,height);
    if(samples.length>1){sctx.strokeStyle="#7ee08a";sctx.beginPath();samples.forEach((sample,index)=>{const x=left+index*width/(samples.length-1),y=bottom-sample.credits/max*height;index?sctx.lineTo(x,y):sctx.moveTo(x,y);});sctx.stroke();}
    sctx.fillStyle="#8d95c9";sctx.fillText(t("ui.balanceCreditsChart"),left,bottom-height-8);
  }
  drawLabels(){}
  status(){return {title:t("ui.balanceLab"),info:this.sys.S.name};}
  selectedInfo(){return {name:t("ui.balanceLab"),detail:t("ui.balanceHint")};}
  primary(){return {label:t("ui.back"),run:()=>this.mgr.pop()};}
  stats(){const economy=this.sys.world?.data?.economy||{},prop=this.sys.playerShip?.prop||{},surface=this.sys.sel?this.sys.obj(this.sys.sel)?.surface:null;return {day:economy.day||0,credits:economy.credits||0,cargoMass:prop.cargoMass||0,cargoCap:prop.cargoCap||0,energy:prop.energy||0,planets:this.sys.S?.planets?.length||0,npcs:this.sys.npcs?.length||0,particles:this.sys.effects?.particles?.length||0,surface};}
  importFile(file){const reader=new FileReader();reader.onload=()=>{try{importConfig(String(reader.result));this.mgr.notify(t("ui.balanceImported"));}catch{this.mgr.notify(t("ui.actionError"),{level:"error"});}this.mgr.onChange?.();};reader.readAsText(file);}
  panelSpec(){
    const tabs=["overview","config","events","tools"];
    const spec=[{kind:"buttons",items:tabs.map(tab=>({label:t(`ui.balance${tab[0].toUpperCase()+tab.slice(1)}`),sel:this.tab===tab,run:()=>{this.tab=tab;}}))}];
    if(this.tab==="overview"){
      const stats=this.stats();spec.push({kind:"rows",empty:t("ui.empty"),items:[
        {tag:"WRLD",label:t("ui.balanceWorld"),note:`${stats.day} d · ${stats.credits} cr`},
        {tag:"SHIP",label:t("ui.balanceShip"),note:`${stats.cargoMass.toFixed(1)} / ${stats.cargoCap.toFixed(1)} t · ${stats.energy.toFixed(0)} E`},
        {tag:"SURF",label:t("ui.balanceSurface"),note:stats.surface?`${Math.round((stats.surface.vegetation||0)*100)}% veg · ${Math.round((stats.surface.cloudCover||0)*100)}% clouds`:t("ui.balanceNoData")},
        {tag:"CIV",label:t("ui.balanceCivilizations"),note:String(Object.keys(this.sys.world?.data?.civilizations||{}).length)}
      ]});
    }else if(this.tab==="config"){
      spec.push({kind:"select",label:t("ui.balanceConfigDomain"),options:domains.map(domain=>[domain,domain]),get:()=>this.domain,set:value=>{this.domain=value;}});
      for(const entry of configEntries(this.domain))spec.push({kind:"range",label:t(entry.label),min:entry.min,max:entry.max,step:entry.step,get:()=>entry.value,set:value=>setConfig(entry.path,value),fmt:value=>String(value)});
      spec.push({kind:"action",label:t("ui.balanceReset"),run:()=>{resetConfig(this.domain);this.mgr.notify(t("ui.balanceResetDone"));}});
    }else if(this.tab==="events"){
      const events=(this.sys.world?telemetrySnapshot(this.sys.world).events:[]).slice(-12).reverse();spec.push({kind:"rows",empty:t("ui.balanceNoData"),items:events.map(event=>({tag:event.type.slice(0,4).toUpperCase(),label:event.type,note:JSON.stringify(event.data)}))});
    }else spec.push({kind:"balanceTools",saveLabel:t("ui.balanceSavePreset"),exportLabel:t("ui.balanceExport"),importLabel:t("ui.balanceImport"),save:()=>{saveConfigPreset(globalThis.prompt?.(t("ui.balancePresetName"),"dev")||"dev");this.mgr.notify(t("ui.balanceSaved"));},export:()=>download("pixel-cosmos-balance.json",exportConfig()),import:file=>this.importFile(file)});
    return spec;
  }
}
