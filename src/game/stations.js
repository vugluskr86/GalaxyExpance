import { stationId } from "../core/ids.js";
import { CATALOG, makeItem } from "./items.js";
import { changeCredits, ensureEconomy, reputationFor } from "./economy.js";
import { crewBonus, gainSkill, recordStat, skillLevel } from "./progression.js";
import { buyDirectorySubscription, buyLocalSurveyMap, sellResearchData } from "./intel.js";

/**
 * Station services are generated from a settlement, not saved as a separate
 * object.  This keeps an untouched universe reproducible from its seed while
 * still giving every dock a stable identity for logs, access and future events.
 */
export const STATION_KINDS=Object.freeze(["trade","shipyard","military","science","medical","pirate","government"]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const systemOf=id=>String(id||"unknown").split("/planet-")[0];

/** Return the specialised stations orbiting a single settlement. */
export function stationsForSettlement(settlement,{systemId:knownSystemId,planetIndex=0}={}){
  if(!settlement)return [];
  const specialization=settlement.specialization||"general",tech=Number(settlement.techLevel||1);
  const security=Number(settlement.security||0),population=Number(settlement.population||0);
  const kinds=["trade"];
  if(["industrial","mining","military"].includes(specialization)||tech>=3)kinds.push("shipyard");
  if(specialization==="military"||security>=.72)kinds.push("military");
  if(specialization==="science"||tech>=4)kinds.push("science");
  if(["agri","science"].includes(specialization)||population>=.7)kinds.push("medical");
  if(settlement.blackMarket||settlement.government==="pirate")kinds.push("pirate");
  if(settlement.government!=="freeport"&&security>=.58)kinds.push("government");
  const system=knownSystemId||systemOf(settlement.id);
  return [...new Set(kinds)].map((kind,index)=>({
    id:stationId(system,planetIndex*8+index),kind,level:clamp(Math.floor(tech+(kind==="military"?1:0)),1,5),
    settlementId:settlement.id
  }));
}

export const stationByKind=(settlement,kind,options)=>stationsForSettlement(settlement,options).find(station=>station.kind===kind)||null;

/** Service-only stock. Goods stay in TradeScene so buy/sell always shares one market. */
export function stationCatalog(kind){
  const slots={
    shipyard:["hull","engine","tank","scoop","reactor","shield","droid","computer","hyperdrive","capacitor","mining"],
    military:["weapon","shield","reactor"], science:["computer","gpu","cpu","ram","drive","peripheral"],
    medical:["droid"], pirate:["weapon","shield","reactor","scoop"]
  }[kind]||[];
  return CATALOG.filter(item=>slots.includes(item.slot));
}

function licenses(world){
  const economy=ensureEconomy(world);
  economy.licenses=economy.licenses&&typeof economy.licenses==="object"?economy.licenses:{};
  return economy.licenses;
}

/** Military clearance is durable and intentionally local to the faction. */
export function hasLicense(world,factionId){return !!licenses(world)[`military:${factionId}`];}
export function buyMilitaryLicense(world,context={}){
  const factionId=context.settlement?.factionId||"frontier",rep=reputationFor(world,context);
  if(hasLicense(world,factionId))return {ok:false,reason:"owned"};
  if(rep.faction<10&&rep.careers.protector<12)return {ok:false,reason:"reputation"};
  const price=42000;
  if(!changeCredits(world,-price,{kind:"military-license",locationId:context.settlement?.id,note:factionId}))return {ok:false,reason:"credits"};
  licenses(world)[`military:${factionId}`]={factionId,day:ensureEconomy(world).day};
  return {ok:true,price};
}

/** Rare hardware needs either a clearance, a career standing or a risky pirate dock. */
export function equipmentAccess(world,station,context,item){
  const rep=reputationFor(world,context),rare=item.cls>=5||item.rating==="A"||item.rating==="S";
  if(!rare)return {ok:true};
  if(station.kind==="pirate")return {ok:true,risk:true};
  const licensed=hasLicense(world,context.settlement?.factionId||"frontier");
  if(station.kind==="military"&&(licensed||rep.careers.protector>=20))return {ok:true};
  if(station.kind==="science"&&rep.careers.researcher>=15)return {ok:true};
  if(station.kind==="shipyard"&&rep.careers.merchant>=18)return {ok:true};
  return {ok:false,reason:"restricted"};
}

export function equipmentPrice(world,station,item){
  const markup=station.kind==="pirate"?1.24:station.kind==="military"?1.1:1.16;
  const technicalDiscount=Math.min(.16,(skillLevel(world,"technical")-1)*.018+crewBonus(world,"technical"));
  return Math.max(1,Math.round(item.price*markup*(1-(station.level-1)*.015)*(1-technicalDiscount)));
}

/** Buy and install a module atomically from a compatible specialist dock. */
export function installStationModule(world,station,context,ship,itemId){
  const item=CATALOG.find(entry=>entry.id===itemId);
  if(!item||!stationCatalog(station.kind).includes(item))return {ok:false,reason:"unavailable"};
  const access=equipmentAccess(world,station,context,item);if(!access.ok)return access;
  if(!ship?.prop?.accepts(makeItem(itemId)))return {ok:false,reason:"slot"};
  const price=equipmentPrice(world,station,item);
  if(!changeCredits(world,-price,{kind:"station-install",locationId:station.id,note:itemId}))return {ok:false,reason:"credits"};
  const old=ship.prop.install(makeItem(itemId));
  if(old)ship.prop.inventory.add(old);
  if(item.slot==="hull")ship.integrity=Math.min(ship.integrity??item.stats.hullInt,item.stats.hullInt);
  gainSkill(world,"technical",Math.max(2,Math.floor(price/50000)),"station installation");
  recordStat(world,"modulesInstalled",1,"station installation");
  return {ok:true,price,item,old};
}

/** Full dockyard repair. Damage is the only charged resource; no frame loop can bill it twice. */
export function repairAtStation(world,station,context,ship,{droidService=false}={}){
  if(!ship?.prop?.slots?.hull)return {ok:false,reason:"ship"};
  const maximum=ship.prop.slots.hull.stats.hullInt||100,current=clamp(Number(ship.integrity??maximum),0,maximum);
  const damage=Math.ceil(maximum-current);if(!damage)return {ok:false,reason:"intact"};
  const technicalDiscount=Math.min(.22,(skillLevel(world,"technical")-1)*.04+crewBonus(world,"technical"));
  const rate=(droidService?13:22)*(1+(5-station.level)*.06)*(1-technicalDiscount);
  const price=Math.max(1,Math.ceil(damage*rate));
  if(!changeCredits(world,-price,{kind:droidService?"medical-droid-repair":"shipyard-repair",locationId:station.id,quantity:damage,note:"hull repair"}))return {ok:false,reason:"credits"};
  ship.integrity=maximum;
  if(ship.prop.shield)ship.prop.shield.charge=ship.prop.shield.stats.capacity;
  gainSkill(world,"technical",Math.max(1,Math.floor(damage/35)),"station repair");
  recordStat(world,"repairPoints",damage,"station repair");
  return {ok:true,price,damage};
}

export function refuelAtStation(world,station,ship){
  const prop=ship?.prop;if(!prop)return {ok:false,reason:"ship"};
  const amount=Math.max(0,prop.fuelCap-prop.fuel);if(amount<=.001)return {ok:false,reason:"fuelFull"};
  const price=Math.max(1,Math.ceil(amount*(95+station.level*8)));
  if(!changeCredits(world,-price,{kind:"station-refuel",locationId:station.id,quantity:Number(amount.toFixed(2)),note:"dock fuel"}))return {ok:false,reason:"credits"};
  prop.refuel();return {ok:true,price,amount};
}

/** A probe is ordinary cargo, so science work uses the same hold limits as trade. */
export function buyProbeAtStation(world,station,ship){
  if(station?.kind!=="science"||!ship?.prop)return {ok:false,reason:"unavailable"};
  const probe=CATALOG.find(item=>item.id==="probe"),prop=ship.prop;
  if(prop.cargoMass+probe.mass>prop.cargoCap)return {ok:false,reason:"capacity"};
  if(!prop.canAddMass(probe.mass))return {ok:false,reason:"overload"};
  const price=Math.round(probe.price*(1.08-(station.level-1)*.01));
  if(!changeCredits(world,-price,{kind:"station-probe",locationId:station.id,goodId:"data",quantity:1,note:"research probe"}))return {ok:false,reason:"credits"};
  prop.cargo.add(makeItem("probe"));return {ok:true,price};
}

/** Research and government desks buy only unsold, persisted discoveries. */
export const sellDataAtStation=(world,station,context={})=>sellResearchData(world,station,context);
export const buyResearchDirectory=(world,station)=>buyDirectorySubscription(world,station,"directory");
export const buyResearchMap=(world,station,scene)=>buyLocalSurveyMap(world,station,scene);

/** Science docks store a compact discovery record that later contracts/events can use. */
export function surveyAtStation(world,station,context,body){
  const economy=ensureEconomy(world),id=body?.id||context.settlement?.id;
  if(!id)return {ok:false,reason:"survey"};
  economy.discoveries=economy.discoveries&&typeof economy.discoveries==="object"?economy.discoveries:{};
  if(economy.discoveries[id])return {ok:false,reason:"surveyed"};
  economy.discoveries[id]={day:economy.day,stationId:station.id,type:body?.type||"unknown"};
  gainSkill(world,"research",Math.round((12+station.level*3)*(1+crewBonus(world,"research"))),"station survey");recordStat(world,"worldsSurveyed",1,"station survey");
  return {ok:true};
}

export function governmentReport(world,context={}){
  const economy=ensureEconomy(world),rep=reputationFor(world,context);
  const achievements=[
    rep.careers.merchant>=10?"merchant":null,rep.careers.protector>=10?"protector":null,
    rep.careers.researcher>=10?"researcher":null,rep.careers.pirate>=10?"pirate":null
  ].filter(Boolean);
  return {rep,achievements,news:economy.transactions.slice(-4).reverse()};
}
