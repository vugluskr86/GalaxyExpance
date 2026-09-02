import { advanceSpectrumScan, directoryEntries, hasDirectorySubscription, scanEvaluation, scanProgress, scanReadiness, scanSettings, signalSignature } from "../game/intel.js";
import { configureScannerClient, networkAddressOptions, scannerClientConfig } from "../game/network.js";
import { t } from "../i18n/index.js";

const scanTargets=scene=>{
  const refs=[{kind:"star",i:0,j:0}];
  scene.S.planets.forEach((planet,i)=>{
    refs.push({kind:"planet",i,j:0});
    planet.moonList.forEach((_moon,j)=>refs.push({kind:"moon",i,j}));
  });
  scene.S.comets.forEach((_comet,i)=>refs.push({kind:"comet",i,j:0}));
  scene.S.belt?.rocks.slice(0,16).forEach((_rock,i)=>refs.push({kind:"rock",i,j:0}));
  scene.npcs?.filter(npc=>!npc.ship.destroyed).forEach(npc=>refs.push({kind:"ship",id:npc.name,i:0,j:0}));
  return refs;
};
const sameRef=(a,b)=>a?.kind===b?.kind&&(a?.kind!=="ship"||a?.id===b?.id)&&a?.i===b?.i&&a?.j===b?.j;

/** The scanner is launched by the ship computer, but the survey loop itself
 * stays game-facing: lock a visible signal, capture several data packets and
 * watch the system information unlock in tiers. */
export class ScannerScene {
  constructor(systemScene,target=null,computerId=null){
    this.sys=systemScene;this.crumb=t("scan.title");
    this.targets=scanTargets(systemScene);this.target=this.targets.find(ref=>sameRef(ref,target||systemScene.sel))||this.targets[0]||null;
    this.message="";this.phase=0;this.computerId=computerId;this.settings=scanSettings(systemScene.world,systemScene);
  }
  update(dt){this.phase+=Math.max(0,dt);this.sys.update(dt);}
  persist(){this.sys.world.capture(this.sys);this.sys.world.persist();}
  readiness(){return this.target?scanReadiness(this.sys,this.target,{computerId:this.computerId}):{ok:false,reason:"no-target"};}
  evaluation(){return this.target?scanEvaluation(this.sys,this.target,this.settings,{computerId:this.computerId}):{ok:false,reason:"no-target",quality:0};}
  progress(){return this.target?scanProgress(this.sys.world,this.sys,this.target):{progress:0,passes:0,complete:false};}
  lockSignal(){
    if(!this.target)return;
    const signature=signalSignature(this.sys,this.target);
    Object.assign(this.settings,{frequency:signature.frequency,bearing:signature.bearing,beam:Math.max(25,Math.min(70,signature.band)),polarization:signature.polarization});
    this.message=t("scan.locked");this.mgr?.onChange?.();
  }
  analyze(){
    if(!this.target)return;
    const result=advanceSpectrumScan(this.sys.world,this.sys,this.target,this.settings,{computerId:this.computerId});
    this.message=result.ok
      ? t("scan.captureResult",{progress:Math.round(result.progress*100),tier:result.record.tier,quality:Math.round(result.quality*100)})
      : t(`scan.error.${result.reason||"weak-signal"}`);
    if(result.ok)this.persist();this.mgr?.onChange?.();
  }
  draw(time){
    this.sys.draw(time);const {sctx,SCR}=this.ctx;
    sctx.fillStyle="rgba(3,9,18,.9)";sctx.fillRect(18,72,SCR-36,205);sctx.strokeStyle="#5b78a6";sctx.strokeRect(18.5,72.5,SCR-37,204);
    sctx.fillStyle="#d7e8ff";sctx.font="12px 'Courier New',monospace";sctx.fillText(t("scan.spectrum"),32,94);
    const signature=this.target?signalSignature(this.sys,this.target):null,top=112,bottom=241,left=34,width=352;
    sctx.strokeStyle="#294667";for(let i=0;i<=8;i++){const x=left+i*width/8;sctx.fillStyle="#294667";sctx.fillRect(Math.round(x),top,1,bottom-top);}
    for(let x=0;x<width;x+=3){
      const frequency=100+x/width*900,peak=signature?Math.exp(-Math.pow((frequency-signature.frequency)/Math.max(12,signature.band),2)):0;
      const noise=.08+(.04*Math.sin(x*.37+this.phase*4)+.025*Math.sin(x*.09-this.phase*2));
      const height=Math.max(2,(noise+peak*(.45+.3*Math.sin(this.phase*5)))*(bottom-top));
      sctx.fillStyle=peak>.18?"#82e6b2":"#47769c";sctx.fillRect(left+x,Math.round(bottom-height),2,Math.round(height));
    }
    const tuning=left+(this.settings.frequency-100)/900*width;sctx.fillStyle="#ffd166";sctx.fillRect(Math.round(tuning)-1,top-4,3,bottom-top+8);
    const ready=this.readiness(),evaluation=this.evaluation(),progress=this.progress();sctx.fillStyle=ready.ok?"#7ee08a":"#ff9a7d";sctx.font="9px 'Courier New',monospace";
    sctx.fillText((ready.ok?t("scan.ready"):t(`scan.error.${ready.reason||"weak-signal"}`))+` · ${t("scan.signalMatch",{quality:Math.round((evaluation.quality||0)*100)})}`,32,262);
    sctx.fillStyle="#24405d";sctx.fillRect(236,251,145,7);sctx.fillStyle=progress.complete?"#82e6b2":"#ffd166";sctx.fillRect(236,251,Math.round(145*progress.progress),7);
  }
  drawLabels(){}
  status(){return {title:t("scan.title"),info:this.target?(this.target.kind==="ship"?this.target.id:this.sys.label(this.target)):t("scan.noTarget")};}
  selectedInfo(){return {name:t("scan.title"),detail:this.message||t("scan.hint")};}
  primary(){return {label:t("scan.back"),run:()=>this.mgr.pop()};}
  panelSpec(){
    const ready=this.readiness(),evaluation=this.evaluation(),progress=this.progress(),network=scannerClientConfig(this.sys.playerShip?.prop,this.computerId),scanners=networkAddressOptions(this.sys.playerShip?.prop,{kind:"scanner"}),antennas=networkAddressOptions(this.sys.playerShip?.prop,{kind:"antenna"});
    const networkStatus=ready.network?.ok?`${ready.network.computer.host} → ${ready.network.scanner.host}, ${ready.network.antenna.host}`:t(`scan.error.${ready.reason||"weak-signal"}`);
    return [
      {kind:"sect",label:t("scan.target")},
      {kind:"select",label:t("scan.target"),options:this.targets.map((ref,index)=>[String(index),ref.kind==="ship"?ref.id:this.sys.label(ref)]),get:()=>String(this.targets.findIndex(ref=>sameRef(ref,this.target))),set:value=>{this.target=this.targets[Number(value)]||this.target;}},
      {kind:"readout",label:t("scan.requirements"),value:ready.ok?t("scan.ready"):t(`scan.error.${ready.reason||"weak-signal"}`)},
      {kind:"readout",label:t("scan.process"),value:t("scan.processValue",{progress:Math.round(progress.progress*100),passes:progress.passes,tier:Math.max(0,Math.ceil(progress.progress*3))})},
      {kind:"readout",label:t("scan.signal"),value:t("scan.signalMatch",{quality:Math.round((evaluation.quality||0)*100)})},
      {kind:"sect",label:t("ui.network")},
      {kind:"readout",label:t("ui.networkDevices"),value:network.computer?`${network.computer.host} · ${network.computer.mac}`:t("ui.networkNoNodes")},
      {kind:"select",label:"Scanner IP",options:[["",t("ui.networkUnassigned")],...scanners.map(item=>[item.address,item.label])],get:()=>network.config?.scannerAddress||"",set:value=>{configureScannerClient(this.sys.playerShip?.prop,this.computerId,{scannerAddress:value});}},
      {kind:"select",label:"Antenna IP",options:[["",t("ui.networkUnassigned")],...antennas.map(item=>[item.address,item.label])],get:()=>network.config?.antennaAddress||"",set:value=>{configureScannerClient(this.sys.playerShip?.prop,this.computerId,{antennaAddress:value});}},
      {kind:"readout",label:t("ui.networkStatus"),value:networkStatus},
      {kind:"sect",label:t("scan.controls")},
      {kind:"range",label:t("scan.frequency"),min:100,max:1000,step:5,get:()=>this.settings.frequency,set:value=>{this.settings.frequency=value;},fmt:value=>`${value} MHz`},
      {kind:"range",label:t("scan.bearing"),min:0,max:359,step:5,get:()=>this.settings.bearing,set:value=>{this.settings.bearing=value;},fmt:value=>`${value}°`},
      {kind:"range",label:t("scan.beam"),min:5,max:180,step:5,get:()=>this.settings.beam,set:value=>{this.settings.beam=value;},fmt:value=>`${value}°`},
      {kind:"select",label:t("scan.polarizationLabel"),options:["linear","circular","elliptic"].map(value=>[value,t(`scan.polarizations.${value}`)]),get:()=>this.settings.polarization,set:value=>{this.settings.polarization=value;}},
      {kind:"range",label:t("scanLabels.rxRate"),min:10,max:100,step:5,get:()=>this.settings.rxRate,set:value=>{this.settings.rxRate=value;},fmt:value=>`${value}%`},
      {kind:"range",label:t("scanLabels.txRate"),min:10,max:100,step:5,get:()=>this.settings.txRate,set:value=>{this.settings.txRate=value;},fmt:value=>`${value}%`},
      {kind:"range",label:t("scanLabels.dataVolume"),min:10,max:100,step:5,get:()=>this.settings.dataVolume,set:value=>{this.settings.dataVolume=value;},fmt:value=>`${value}%`},
      {kind:"buttons",items:["spectrum","graphic"].map(mode=>({label:t(`scanLabels.modes.${mode}`),sel:this.settings.mode===mode,run:()=>{this.settings.mode=mode;}}))},
      {kind:"action",label:t("scan.lock"),run:()=>this.lockSignal()},
      {kind:"action",label:t("scan.analyze"),disabled:!ready.ok,reason:ready.reason,run:()=>this.analyze()}
    ];
  }
}

/** Subscription-backed directory. It deliberately works as a distinct scene
 * so navigation data does not leak into normal object tooltips. */
export class IntelDirectoryScene {
  constructor(systemScene){this.sys=systemScene;this.crumb=t("scan.directory");this.filter="all";this.query="";}
  update(dt){this.sys.update(dt);}
  draw(time){
    this.sys.draw(time);const {sctx,SCR}=this.ctx;sctx.fillStyle="rgba(3,9,18,.84)";sctx.fillRect(18,72,SCR-36,205);sctx.strokeStyle="#5b78a6";sctx.strokeRect(18.5,72.5,SCR-37,204);
    sctx.fillStyle="#d7e8ff";sctx.font="12px 'Courier New',monospace";sctx.fillText(t("scan.directory"),32,98);
    sctx.fillStyle=hasDirectorySubscription(this.sys.world)?"#7ee08a":"#ff9a7d";sctx.font="9px 'Courier New',monospace";sctx.fillText(hasDirectorySubscription(this.sys.world)?t("scan.directoryReady"):t("scan.directoryLocked"),32,120);
  }
  drawLabels(){}
  status(){return {title:t("scan.directory"),info:this.sys.S.name};}
  selectedInfo(){return {name:t("scan.directory"),detail:hasDirectorySubscription(this.sys.world)?t("scan.directoryHint"):t("scan.directoryLocked")};}
  primary(){return {label:t("scan.back"),run:()=>this.mgr.pop()};}
  panelSpec(){
    if(!hasDirectorySubscription(this.sys.world))return [{kind:"readout",label:t("scan.directory"),value:t("scan.directoryLocked")}];
    const entries=directoryEntries(this.sys.world,this.sys).filter(entry=>(this.filter==="all"||entry.kind===this.filter)&&entry.name.toLowerCase().includes(this.query.toLowerCase()));
    return [
      {kind:"buttons",items:["all","station","planet","moon","star","ship"].map(kind=>({label:t(`scan.filter.${kind}`),sel:this.filter===kind,run:()=>{this.filter=kind;}}))},
      {kind:"text",label:t("scan.search"),placeholder:t("scan.searchPlaceholder"),get:()=>this.query,set:value=>{this.query=value;}},
      {kind:"rows",empty:t("scan.directoryEmpty"),items:entries.map(entry=>({tag:entry.kind.slice(0,3).toUpperCase(),label:entry.name,note:t(`scan.entry.${entry.detail}`),actions:entry.ref?[{label:t("scan.select"),run:()=>{this.sys.sel={...entry.ref};this.mgr.pop();}}]:[]}))}
    ];
  }
}
