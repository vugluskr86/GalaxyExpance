import { autoWireNetwork, configureSwitch, connectNetworkPorts, disconnectNetworkPort, dhcpAll, networkCommand, networkTopology, switchConfig } from "../game/network.js";
import { t } from "../i18n/index.js";

/** Visual wiring bay for the ship-local Ethernet bus. All cable mutations are
 * explicit panel actions and are persisted by the owning SystemScene on leave. */
export class NetworkScene {
  constructor(sys){this.sys=sys;this.crumb=t("ui.network");this.message="";this.selectedSwitchId=null;}
  get prop(){return this.sys.playerShip?.prop;}
  update(dt){this.sys.update(dt);}
  run(command){const lines=networkCommand(this.prop,command,{scene:this.sys,ship:this.sys.playerShip}),terminal=globalThis._pixelCosmosTerminal;for(const line of lines)terminal?.print(line);this.message=lines.join(" · ");}
  draw(){
    const {sctx,SCR}=this.ctx,{nodes,links,byId,network}=networkTopology(this.prop);
    sctx.fillStyle="#060914";sctx.fillRect(0,0,SCR,SCR);
    const positions=new Map(nodes.map((node,index)=>{const sw=node.kind==="switch",x=sw?SCR/2:70+(index%2)*280,y=sw?85+index*42:145+Math.floor(index/2)*48;return [node.id,{x,y}];}));
    sctx.strokeStyle="#39527e";sctx.lineWidth=1;
    for(const link of links){const a=positions.get(link.a),b=positions.get(link.b);if(!a||!b)continue;sctx.beginPath();sctx.moveTo(a.x,a.y);sctx.lineTo(b.x,b.y);sctx.stroke();}
    for(const node of nodes){const p=positions.get(node.id),used=links.filter(link=>link.a===node.id||link.b===node.id).length;
      sctx.fillStyle=node.powered?node.kind==="switch"?"#405d91":"#204d68":"#41252e";sctx.fillRect(p.x-48,p.y-13,96,26);sctx.strokeStyle=node.powered?"#8fd0ff":"#ff6b6b";sctx.strokeRect(p.x-48,p.y-13,96,26);
      sctx.fillStyle="#d7e5ff";sctx.font="7px monospace";sctx.fillText(node.host.slice(0,14),p.x-43,p.y-2);sctx.fillStyle="#a9b9d6";sctx.fillText(`${network.addresses[node.id]||"DHCP?"} ${used}/${node.ports}`,p.x-43,p.y+8);
    }
    if(!nodes.length){sctx.fillStyle="#a9b9d6";sctx.font="12px monospace";sctx.fillText(t("ui.networkNoNodes"),90,210);}
  }
  panelSpec(){
    const prop=this.prop;if(!prop)return [];
    const {nodes,links,byId,network}=networkTopology(prop),switches=nodes.filter(node=>node.kind==="switch");
    this.selectedSwitchId=switches.some(node=>node.id===this.selectedSwitchId)?this.selectedSwitchId:switches[0]?.id||null;
    const selectedSwitch=switches.find(node=>node.id===this.selectedSwitchId)||null,config=selectedSwitch?switchConfig(prop,selectedSwitch.id):null;
    const leases=Object.entries(network.leases||{}).map(([id,lease])=>({node:byId.get(id),lease})).filter(item=>item.node);
    const lines=nodes.filter(node=>node.kind!=="switch").map(node=>{const used=links.filter(link=>link.a===node.id||link.b===node.id).length;return {tag:node.kind.slice(0,3).toUpperCase(),label:node.name,note:`${network.addresses[node.id]||t("ui.networkUnassigned")} · ${used}/${node.ports}`,sub:`${node.mac} · ${node.driver}`,actions:switches.filter(sw=>used<node.ports).map(sw=>({label:t("ui.networkConnect"),run:()=>{const r=connectNetworkPorts(prop,node.id,sw.id);this.message=r.ok?t("ui.networkConnected"):r.reason;}}))};});
    return [
      ...(selectedSwitch?[{kind:"sect",label:"Switch control"},
        {kind:"buttons",items:switches.map(node=>({label:`${node.host} (${node.ports})`,sel:node.id===selectedSwitch.id,run:()=>{this.selectedSwitchId=node.id;}}))},
        {kind:"readout",label:"Controller",value:`${selectedSwitch.item.stats.cpu} · ${selectedSwitch.item.stats.ramKb} KB · ${selectedSwitch.item.stats.firmware}`},
        {kind:"buttons",items:[
          {label:`DHCP ${config.dhcpEnabled?"ON":"OFF"}`,sel:config.dhcpEnabled,run:()=>configureSwitch(prop,selectedSwitch.id,{dhcpEnabled:!config.dhcpEnabled})},
          {label:`DNS ${config.dnsEnabled?"ON":"OFF"}`,sel:config.dnsEnabled,run:()=>configureSwitch(prop,selectedSwitch.id,{dnsEnabled:!config.dnsEnabled})}
        ]},
        {kind:"text",label:"DHCP subnet",get:()=>config.subnet,set:value=>{const result=configureSwitch(prop,selectedSwitch.id,{subnet:value});this.message=result.ok?"DHCP configured":result.reason;}},
        {kind:"range",label:"Lease minutes",min:1,max:1440,step:1,get:()=>config.leaseMinutes,set:value=>configureSwitch(prop,selectedSwitch.id,{leaseMinutes:value}),fmt:value=>`${value} min`},
        {kind:"text",label:"DNS domain",get:()=>config.domain,set:value=>{const result=configureSwitch(prop,selectedSwitch.id,{domain:value});this.message=result.ok?"DNS configured":result.reason;}},
        {kind:"sect",label:"DHCP leases"},
        {kind:"rows",empty:t("ui.networkUnassigned"),items:leases.map(({node,lease})=>({tag:"IP",label:`${node.host} · ${lease.address}`,note:`${node.mac} · ${lease.leaseMinutes} min`,sub:`DNS ${lease.dns} · ${byId.get(lease.server)?.host||lease.server}`}))}
        ,{kind:"sect",label:"MAC forwarding table"},
        {kind:"rows",empty:t("ui.networkNoLinks"),items:Object.entries(network.macTables[selectedSwitch.id]||{}).map(([mac,nodeId])=>({tag:"MAC",label:mac,note:byId.get(nodeId)?.host||nodeId,sub:network.addresses[nodeId]||t("ui.networkUnassigned")}))}
      ]:[]),
      {kind:"readout",label:t("ui.network"),value:`${nodes.length} ${t("ui.networkNodes")} · ${links.length} ${t("ui.networkLinks")}`},
      {kind:"buttons",items:[{label:t("ui.networkAutoWire"),run:()=>{const r=autoWireNetwork(prop);this.message=r.ok?`${t("ui.networkConnected")}: ${r.connected}`:r.reason;}},{label:"DHCP",run:()=>{dhcpAll(prop);this.run("ip");}}]},
      {kind:"sect",label:t("ui.networkDevices")},{kind:"rows",empty:t("ui.networkNoNodes"),items:lines},
      {kind:"sect",label:t("ui.networkLinks")},{kind:"rows",empty:t("ui.networkNoLinks"),items:links.map(link=>({tag:"ETH",label:`${byId.get(link.a)?.host||link.a} ↔ ${byId.get(link.b)?.host||link.b}`,note:"cable",actions:[{label:t("ui.networkDisconnect"),warn:true,run:()=>disconnectNetworkPort(prop,link.a,link.b)}]}))},
      {kind:"sect",label:t("ui.networkDiagnostics")},{kind:"buttons",items:["ip","dhcp","netstat","ping engine","nslookup engine","curl engine/status"].map(command=>({label:command,run:()=>this.run(command)}))},
      ...(this.message?[{kind:"readout",label:t("ui.networkStatus"),value:this.message}]:[])
    ];
  }
}
