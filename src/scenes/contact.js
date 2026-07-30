import { communicationStatus, equipmentReason, scannerStatus } from "../game/equipment.js";

/** Detailed contact card.  The scan tier is evaluated every frame: removing a
 * scanner/antenna immediately hides data and actions instead of leaking it. */
export class ContactScene {
  constructor(sys,npc){this.sys=sys;this.npc=npc;this.crumb="Контакт";}
  get distance(){
    const player=this.sys.playerShip,ship=this.npc?.ship;
    if(!player||!ship)return Infinity;
    const a=player.globPos(this.sys),b=ship.globPos(this.sys);return Math.hypot(a[0]-b[0],a[1]-b[1]);
  }
  get comm(){return communicationStatus(this.sys.playerShip?.prop,this.distance);}
  get scan(){return scannerStatus(this.sys.playerShip?.prop,this.distance);}
  update(){}
  draw(){
    const {sctx,SCR}=this.ctx;sctx.fillStyle="#060a13";sctx.fillRect(0,0,SCR,SCR);
    sctx.strokeStyle="#6685bd";sctx.strokeRect(28,28,SCR-56,SCR-56);
    const ship=this.npc?.ship,integrity=Math.max(0,Math.round(ship?.integrity??100));
    sctx.fillStyle=ship?.col||"#d3a74a";sctx.fillRect(166,148,88,118);sctx.fillStyle="#0b1327";sctx.fillRect(190,126,40,26);
    sctx.fillStyle="#dbe7ff";sctx.font="14px 'Courier New',monospace";
    sctx.fillText(this.npc?.name||"Неизвестный корабль",52,76);sctx.fillText("ДИСТ " + this.distance.toFixed(1)+" DU",52,102);
    sctx.fillStyle=integrity>35?"#81d59b":"#ff8a78";sctx.fillText("КОРПУС "+integrity+"%",52,328);
  }
  panelSpec(){
    const ship=this.npc?.ship,scan=this.scan,comm=this.comm,spec=[{kind:"sect",label:this.npc?.name||"Контакт"}];
    spec.push({kind:"readout",label:"Канал",value:comm.ok
      ? `сигнал ${Math.round(comm.signal*100)}% · ${comm.channels} канал(ов)`
      : `связь недоступна: ${equipmentReason(comm.reason)}`});
    spec.push({kind:"readout",label:"Сканер",value:scan.ok
      ? `разрешение ${scan.resolution} · сигнал ${Math.round(scan.signal*100)}%`
      : `данные ограничены: ${equipmentReason(scan.reason)}`});
    if(scan.resolution>=1)spec.push({kind:"readout",label:"Корпус",value:`${ship?.prop?.hull?.name||"неизвестен"}<br>прочность ${Math.round(ship?.integrity??100)}%`});
    if(scan.resolution>=2){
      const modules=(ship?.prop?.slotDefs||[]).map(slot=>ship.prop.slots[slot.id]).filter(Boolean).map(item=>item.name).join(" · ")||"нет данных";
      spec.push({kind:"readout",label:"Оборудование",value:modules});
    }
    if(scan.resolution>=3)spec.push({kind:"readout",label:"Груз и боезапас",value:`трюм ${ship?.prop?.cargoMass?.toFixed(1)??0} т · оружие ${ship?.prop?.weapons?.length??0}`});
    const actions=[];
    if(comm.ok){
      actions.push({label:"Связаться",run:()=>{this.sys.combatMsg="канал связи с "+this.npc.name+" открыт";this.mgr.pop();}});
      actions.push({label:"Торговля",run:()=>{this.sys.combatMsg="торговый протокол: ожидается грузовой шлюз";this.mgr.pop();}});
      actions.push({label:"Контракты",run:()=>{this.sys.combatMsg="у контакта нет доступных контрактов";this.mgr.pop();}});
    }
    actions.push({label:"Захватить",run:()=>{this.sys.lockNpc(this.npc);this.mgr.pop();}});
    if(actions.length)spec.push({kind:"buttons",items:actions});
    return spec;
  }
  primary(){return {label:"← назад",run:()=>this.mgr.pop()};}
}
