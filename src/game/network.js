/**
 * Bounded ship Ethernet model.
 *
 * This deliberately simulates topology and protocols, not browser sockets:
 * every call is synchronous, frames are capped and retained only as a short
 * diagnostic tail.  It keeps the simulation deterministic, cheap per frame
 * and safe to expose to player programs.  A cable endpoint is a stable item
 * instance ID (or a permanent ship slot for fixed equipment), so moving an
 * item in inventory never silently reconnects another device.
 */
import { ensureItemInstanceId } from "./items.js";
import { communicationStatus } from "./equipment.js";

const MAX_FRAMES=64, MAX_TCP=16;
const hash32=text=>{let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const macFor=id=>{const h=hash32(id);return [0x02,(h>>>24)&255,(h>>>16)&255,(h>>>8)&255,h&255,hash32(`${id}:mac`)&255].map(v=>v.toString(16).padStart(2,"0")).join(":");};
const nodeId=(item,fallback)=>item?`item:${ensureItemInstanceId(item)}`:`slot:${fallback}`;
const hostname=name=>String(name||"device").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"device";

export function ensureShipNetwork(prop){
  prop.network??={};
  prop.network.links??=[];prop.network.addresses??={};prop.network.macTables??={};prop.network.tcp??=[];prop.network.frames??=[];
  /* Switch configuration and scanner client settings are saved by stable node
     ID.  They therefore survive changing slots without making a new device
     silently inherit the old device's network identity. */
  prop.network.switches??={};prop.network.leases??={};prop.network.scannerClients??={};
  return prop.network;
}

/** Build the currently fitted network inventory. Equipment has one embedded
 * Ethernet port; a regular computer needs a fitted NIC, while a switch has
 * 8/16/24/32 physical ports and its immutable control CPU/RAM in item.stats. */
export function networkNodes(prop){
  if(!prop)return [];
  const powered=!!prop.reactor;
  const nodes=[];
  for(const [slot,item] of Object.entries(prop.slots||{})){
    if(!item)continue;
    if(item.slot==="computer"){
      if(item.stats.networkSwitch){
        const id=nodeId(item,slot);nodes.push({id,slot,item,kind:"switch",name:item.name,host:hostname(item.name),mac:macFor(id),ports:item.stats.ports||8,powered,driver:"swos"});
      }else{
        const nic=Object.values(item.slots||{}).find(child=>child?.stats?.network);
        if(nic){const id=nodeId(item,slot);nodes.push({id,slot,item,nic,kind:"computer",name:item.name,host:hostname(item.name),mac:macFor(id),ports:nic.stats.ports||1,powered,driver:nic.stats.driver||"nic"});}
      }
      continue;
    }
    if(["hull","tank","scoop","shield","droid","reactor","capacitor","hyperdrive","mining"].includes(slot))continue;
    const id=nodeId(item,slot);nodes.push({id,slot,item,kind:slot.startsWith("weapon")?"weapon":slot,name:item.name,host:hostname(slot),mac:macFor(id),ports:1,powered,driver:`${slot}-driver`});
  }
  return nodes;
}

const usedPorts=(network,id)=>network.links.reduce((count,link)=>count+(link.a===id||link.b===id?1:0),0);
export function networkTopology(prop){
  const network=ensureShipNetwork(prop),nodes=networkNodes(prop),byId=new Map(nodes.map(n=>[n.id,n]));
  const links=network.links.filter(link=>byId.has(link.a)&&byId.has(link.b));
  if(links.length!==network.links.length)network.links=links;
  return {network,nodes,links,byId};
}
export function switchConfig(prop,switchId){
  const network=ensureShipNetwork(prop),saved=network.switches[switchId]||{};
  return network.switches[switchId]??(network.switches[switchId]={
    dhcpEnabled:saved.dhcpEnabled??true,dnsEnabled:saved.dnsEnabled??true,
    subnet:saved.subnet||"10.42.0",leaseMinutes:Math.max(1,Math.min(1440,saved.leaseMinutes||60)),
    domain:saved.domain||"ship.local"
  });
}
export function configureSwitch(prop,switchId,patch={}){
  const {byId}=networkTopology(prop),node=byId.get(switchId);if(node?.kind!=="switch")return {ok:false,reason:"not-switch"};
  const config=switchConfig(prop,switchId);
  if(Object.hasOwn(patch,"dhcpEnabled"))config.dhcpEnabled=!!patch.dhcpEnabled;
  if(Object.hasOwn(patch,"dnsEnabled"))config.dnsEnabled=!!patch.dnsEnabled;
  if(Object.hasOwn(patch,"leaseMinutes"))config.leaseMinutes=Math.max(1,Math.min(1440,Math.round(Number(patch.leaseMinutes)||60)));
  if(Object.hasOwn(patch,"subnet")){const value=String(patch.subnet).trim();if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value))return {ok:false,reason:"invalid-subnet"};config.subnet=value;}
  if(Object.hasOwn(patch,"domain")){const value=String(patch.domain).trim().toLowerCase();if(!/^[a-z0-9][a-z0-9.-]{0,62}$/.test(value))return {ok:false,reason:"invalid-domain"};config.domain=value;}
  return {ok:true,config};
}
export function connectNetworkPorts(prop,a,b){
  const {network,byId}=networkTopology(prop),left=byId.get(a),right=byId.get(b);
  if(!left||!right)return {ok:false,reason:"missing-node"};
  if(a===b)return {ok:false,reason:"same-node"};
  if(network.links.some(link=>(link.a===a&&link.b===b)||(link.a===b&&link.b===a)))return {ok:false,reason:"already-linked"};
  if(!left.powered||!right.powered)return {ok:false,reason:"no-power"};
  if(usedPorts(network,a)>=left.ports||usedPorts(network,b)>=right.ports)return {ok:false,reason:"no-free-port"};
  network.links.push({a,b});return {ok:true};
}
export function disconnectNetworkPort(prop,a,b){
  const network=ensureShipNetwork(prop),before=network.links.length;
  network.links=network.links.filter(link=>!((link.a===a&&link.b===b)||(link.a===b&&link.b===a)));
  return before!==network.links.length;
}
/** Connect every unlinked device to the first switch; this is an explicit UI
 * action rather than implicit magic, so a player can still create failures. */
export function autoWireNetwork(prop){
  const {nodes}=networkTopology(prop),sw=nodes.find(node=>node.kind==="switch");
  if(!sw)return {ok:false,reason:"no-switch",connected:0};let connected=0;
  for(const node of nodes){if(node.id===sw.id)continue;const result=connectNetworkPorts(prop,node.id,sw.id);if(result.ok)connected++;}
  return {ok:true,connected};
}
const adjacent=(links,id)=>links.flatMap(link=>link.a===id?[link.b]:link.b===id?[link.a]:[]);
export function networkPath(prop,from,to){
  const {nodes,links,byId}=networkTopology(prop);if(!byId.has(from)||!byId.has(to))return null;
  const queue=[[from]],seen=new Set([from]);
  while(queue.length){const path=queue.shift(),last=path.at(-1);if(last===to)return path;
    for(const next of adjacent(links,last)){if(!seen.has(next)&&byId.get(next)?.powered){seen.add(next);queue.push([...path,next]);}}
  }return null;
}
export function dhcpLease(prop,nodeIdValue){
  const {network,nodes,byId}=networkTopology(prop),node=byId.get(nodeIdValue);
  if(!node||node.kind==="switch"||!node.powered)return {ok:false,reason:"unavailable"};
  const server=nodes.find(candidate=>candidate.kind==="switch"&&networkPath(prop,node.id,candidate.id));
  if(!server)return {ok:false,reason:"no-dhcp-route"};
  const config=switchConfig(prop,server.id);if(!config.dhcpEnabled)return {ok:false,reason:"dhcp-disabled"};
  const index=nodes.filter(n=>n.kind!=="switch").map(n=>n.id).sort().indexOf(node.id)+10;
  const address=`${config.subnet}.${Math.max(10,index)}`,gateway=`${config.subnet}.1`;
  network.addresses[node.id]=address;network.leases[node.id]={address,gateway,dns:gateway,server:server.id,issuedAt:Date.now(),leaseMinutes:config.leaseMinutes};
  return {ok:true,address,gateway,dns:gateway,server:server.id,leaseMinutes:config.leaseMinutes};
}
export function dhcpAll(prop){const {nodes}=networkTopology(prop);return nodes.filter(node=>node.kind!=="switch").map(node=>({node,lease:dhcpLease(prop,node.id)}));}
export function dnsLookup(prop,name){
  const {network,nodes}=networkTopology(prop),needle=String(name||"").toLowerCase();
  const server=nodes.find(node=>node.kind==="switch"&&switchConfig(prop,node.id).dnsEnabled);
  if(!server)return {ok:false,reason:"dns-disabled"};
  const node=nodes.find(n=>n.host===needle||n.slot===needle||n.name.toLowerCase()===needle);
  return node&&network.addresses[node.id]?{ok:true,address:network.addresses[node.id],node,server}:{ok:false,reason:"not-found"};
}
export function networkAddressOptions(prop,{kind=null}={}){
  const {network,nodes}=networkTopology(prop);
  return nodes.filter(node=>(!kind||node.kind===kind)&&network.addresses[node.id])
    .map(node=>({id:node.id,address:network.addresses[node.id],label:`${node.host} · ${network.addresses[node.id]}`}));
}
export function scannerClientConfig(prop,computerId=null){
  const {network,nodes}=networkTopology(prop);
  const computer=nodes.find(node=>node.kind==="computer"&&(!computerId||node.item?.instanceId===computerId))||nodes.find(node=>node.kind==="computer")||null;
  if(!computer)return {computer:null,config:null};
  const config=network.scannerClients[computer.id]??(network.scannerClients[computer.id]={scannerAddress:"",antennaAddress:""});
  return {computer,config};
}
export function configureScannerClient(prop,computerId,patch={}){
  const {computer,config}=scannerClientConfig(prop,computerId);if(!computer||!config)return {ok:false,reason:"no-network-computer"};
  for(const key of ["scannerAddress","antennaAddress"])if(Object.hasOwn(patch,key))config[key]=String(patch[key]||"");
  return {ok:true,computer,config};
}
/** Scanner and antenna telemetry must traverse the same fitted ship network as
 * every other peripheral.  A status request is represented by two bounded UDP
 * frames, so diagnostics can prove which configured devices supplied the UI. */
export function scannerNetworkReadiness(prop,computerId=null,context={}){
  const {network,nodes}=networkTopology(prop),{computer,config}=scannerClientConfig(prop,computerId);
  if(!computer)return {ok:false,reason:"no-network-computer"};
  if(!network.addresses[computer.id])return {ok:false,reason:"no-computer-address",computer,config};
  const scanner=nodes.find(node=>node.kind==="scanner"&&network.addresses[node.id]===config?.scannerAddress);
  if(!scanner)return {ok:false,reason:"no-scanner-address",computer,config};
  const antenna=nodes.find(node=>node.kind==="antenna"&&network.addresses[node.id]===config?.antennaAddress);
  if(!antenna)return {ok:false,reason:"no-antenna-address",computer,config};
  const scannerFrame=udpSend(prop,computer.id,scanner.id,{service:"scanner",method:"status"});
  const antennaFrame=udpSend(prop,computer.id,antenna.id,{service:"antenna",method:"status"});
  if(!scannerFrame.ok||!antennaFrame.ok)return {ok:false,reason:"no-network-route",computer,scanner,antenna,config};
  return {ok:true,computer,scanner,antenna,config,
    scannerStatus:deviceStatus(prop,scanner,context),antennaStatus:deviceStatus(prop,antenna,context)};
}
export function sendEthernet(prop,from,to,type="udp",payload={}){
  const {network,byId}=networkTopology(prop),source=byId.get(from),target=byId.get(to),path=networkPath(prop,from,to);
  if(!source||!target||!path)return {ok:false,reason:"no-route"};
  for(const id of path){const node=byId.get(id);if(node.kind==="switch"){network.macTables[id]??={};network.macTables[id][source.mac]=from;network.macTables[id][target.mac]=to;}}
  const frame={from,to,type,payload,path,at:Date.now()};network.frames.push(frame);if(network.frames.length>MAX_FRAMES)network.frames.splice(0,network.frames.length-MAX_FRAMES);
  return {ok:true,frame};
}
export function udpSend(prop,from,to,payload){return sendEthernet(prop,from,to,"udp",payload);}
export function tcpConnect(prop,from,to){
  const packet=sendEthernet(prop,from,to,"tcp-syn",{});if(!packet.ok)return packet;
  const network=ensureShipNetwork(prop);if(network.tcp.length>=MAX_TCP)return {ok:false,reason:"tcp-limit"};
  const id=`tcp-${hash32(`${from}:${to}:${network.tcp.length}`)}`;network.tcp.push({id,from,to,state:"established",messages:[]});return {ok:true,id,state:"established"};
}
export function tcpSend(prop,id,payload){const connection=ensureShipNetwork(prop).tcp.find(item=>item.id===id&&item.state==="established");if(!connection)return {ok:false,reason:"closed"};const result=sendEthernet(prop,connection.from,connection.to,"tcp",payload);if(result.ok)connection.messages.push(payload);return result;}
export function tcpClose(prop,id){const connection=ensureShipNetwork(prop).tcp.find(item=>item.id===id);if(!connection)return false;connection.state="closed";return true;}

function deviceStatus(prop,node,context={}){
  const ship=context.ship||prop.networkShip;
  if(node.kind==="engine")return {throttle:prop.throttle,fuel:prop.fuel,thrust:prop.engine.thrust,overloaded:prop.overloadStatus().overloaded};
  if(node.kind==="gyro")return {nose:ship?.nose??0,turnRate:node.item.stats.turnRate||ship?.turnRate||0};
  if(node.kind==="scanner"){
    const scene=context.scene,resolution=node.item.stats.resolution||0,objects=[...(scene?.S?.planets||[]).map((body,index)=>({kind:"planet",index,name:body.name||`planet-${index}`})),...(resolution>=2?(scene?.npcs||[]).map((npc,index)=>({kind:"ship",index,name:npc.name,profile:npc.agent?.profileId})):[]),...(resolution>=3?(scene?.cargoField||[]).map((item,index)=>({kind:"cargo",index,name:item.item?.name||"cargo"})):[])];
    return {range:node.item.stats.range,resolution:node.item.stats.resolution,objects};
  }
  if(node.kind==="weapon")return {ammo:node.item.stats.ammo?node.item.ammoLeft??node.item.stats.ammo:"energy",cooldown:node.item.cooldownLeft||0,temperature:Math.round((node.item.heat||0)*100),ready:!(node.item.cooldownLeft>0)};
  return {powered:node.powered,driver:node.driver};
}
/** Minimal authenticated-by-topology HTTP API. POST is intentionally
 * whitelisted: it can only set a clamped throttle, request a bounded turn,
 * or call the same weapon fire method used by manual controls. */
export function httpRequest(prop,from,host,path="/status",method="GET",body={},context={}){
  const resolved=dnsLookup(prop,host);if(!resolved.ok)return {ok:false,status:404,reason:resolved.reason};
  const target=resolved.node,route=sendEthernet(prop,from,target.id,"http",{method,path});if(!route.ok)return {ok:false,status:503,reason:route.reason};
  if(method==="POST"&&target.kind==="engine"&&path==="/throttle")prop.throttle=Math.max(0,Math.min(1,Number(body.value)||0));
  else if(method==="POST"&&target.kind==="gyro"&&path==="/turn"){
    const ship=context.ship||prop.networkShip;if(!ship)return {ok:false,status:409,reason:"no-ship"};
    ship.nose=Number(body.angle)||ship.nose;
  }else if(method==="POST"&&target.kind==="weapon"&&path==="/fire"){
    const fired=prop.fireWeapon(target.slot);if(!fired)return {ok:false,status:409,reason:"not-ready"};return {ok:true,status:200,body:{fired:fired.id}};
  }else if(method!=="GET")return {ok:false,status:405,reason:"method-not-allowed"};
  return {ok:true,status:200,body:deviceStatus(prop,target,context)};
}

/** Routed inter-ship request. The radio hop is constrained by both fitted
 * antennas; after it reaches the remote ship, the same local HTTP whitelist
 * is used. This avoids a second protocol implementation and prevents a
 * remote request from bypassing either ship's cabling or gameplay limits. */
export function remoteHttpRequest(prop,targetProp,distance,from,host,path="/status",method="GET",body={},context={}){
  const radio=communicationStatus(prop,distance),remoteRadio=communicationStatus(targetProp,distance);
  if(!radio.ok||!remoteRadio.ok)return {ok:false,status:503,reason:!radio.ok?radio.reason:remoteRadio.reason};
  const source=networkTopology(prop).byId.get(from);if(!source||!prop.network?.addresses?.[from])return {ok:false,status:503,reason:"no-source-address"};
  const target=networkTopology(targetProp).nodes.find(node=>node.host===String(host).toLowerCase()||node.slot===host);
  if(!target)return {ok:false,status:404,reason:"not-found"};
  /* The virtual radio frame is retained in diagnostics, then the remote
     endpoint receives the request through its own topology-gated handler. */
  const network=ensureShipNetwork(prop);network.frames.push({from,to:`remote:${target.id}`,type:"ipv4-radio",payload:{host,path,method},at:Date.now()});
  if(network.frames.length>MAX_FRAMES)network.frames.shift();
  const remoteComputer=networkTopology(targetProp).nodes.find(node=>node.kind==="computer");
  if(!remoteComputer)return {ok:false,status:503,reason:"remote-no-controller"};
  return httpRequest(targetProp,remoteComputer.id,host,path,method,body,context);
}

/** Shell adapter used by PixelOS and the network screen. It provides the six
 * documented utilities without extending the CPU ABI or opening real sockets. */
export function networkCommand(prop,line,context={}){
  const [command,...args]=String(line||"").trim().split(/\s+/);const {nodes,network}=networkTopology(prop);const own=nodes.find(node=>node.kind==="computer");
  const source=own?.id;if(!command)return [];
  if(command==="ip")return nodes.map(node=>`${node.host}\t${network.addresses[node.id]||"unassigned"}\t${node.mac}\t${node.driver}`);
  if(command==="dhcp")return dhcpAll(prop).map(({node,lease})=>`${node.host}: ${lease.ok?lease.address:lease.reason}`);
  if(command==="netstat")return [`links ${network.links.length}; frames ${network.frames.length}; tcp ${network.tcp.length}`,...network.tcp.map(c=>`${c.id}\t${c.state}\t${c.from} -> ${c.to}`)];
  if(command==="nslookup"){const result=dnsLookup(prop,args[0]);return [result.ok?`${args[0]}\t${result.address}`:`DNS: ${result.reason}`];}
  if(command==="ping"){const target=dnsLookup(prop,args[0]);const route=source&&target.ok?sendEthernet(prop,source,target.node.id,"icmp",{}):{ok:false,reason:"no-route"};return [route.ok?`reply from ${target.address}: hops=${route.frame.path.length-1}`:`ping: ${route.reason}`];}
  if(command==="curl"){
    const method=(args[0]||"GET").toUpperCase()==="POST"?args.shift().toUpperCase():"GET",url=args[0]||"";const match=url.match(/^([^/]+)(\/.*)?$/);if(!source||!match)return ["curl: usage curl [POST] host/path"];
    const result=httpRequest(prop,source,match[1],match[2]||"/status",method,{},context);return [result.ok?JSON.stringify(result.body):`HTTP ${result.status||0}: ${result.reason}`];
  }
  return [`network: unknown utility ${command}`];
}
