import { hash2i } from "../core/rng.js";
import { GOODS, changeReputation, changeStock, ensureEconomy, marketQuote } from "./economy.js";
import { crewBonus, gainSkill, recordStat } from "./progression.js";

/**
 * Global pressure is simulated only for markets the player has discovered.
 * That keeps the universe compact: unvisited systems remain procedural, while
 * every known system advances at the same discrete game-day boundary.
 */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const unit=(...parts)=>(hash2i(...parts)>>>0)/0x100000000;
const systemOf=id=>String(id||"unknown").split("/planet-")[0];
const good=id=>GOODS.find(entry=>entry.id===id);

/** Event templates contain data only; UI resolves their names through i18n. */
export const WORLD_EVENT_TYPES=Object.freeze({
  blockade:{duration:[3,6],danger:.26,defense:-14,priceModifiers:{food:1.55,water:1.42,fuel:1.48,medicine:1.28},requirement:"food",actions:["delivery","combat","diplomacy","sabotage"]},
  war:{duration:[4,7],danger:.32,defense:-20,priceModifiers:{arms:1.62,fuel:1.42,medicine:1.35,components:1.24},requirement:"medicine",actions:["delivery","combat","diplomacy"]},
  epidemic:{duration:[3,6],danger:.08,defense:-8,priceModifiers:{medicine:1.82,food:1.22,water:1.18},requirement:"medicine",actions:["delivery","survey"]},
  industrialBoom:{duration:[3,6],danger:-.04,defense:8,priceModifiers:{ore:1.38,components:1.3,electronics:1.22,fuel:1.15},requirement:"components",actions:["delivery"]},
  stationAccident:{duration:[2,5],danger:.14,defense:-11,priceModifiers:{components:1.62,electronics:1.48,fuel:1.2},requirement:"components",actions:["delivery","survey"]},
  pirateRaid:{duration:[2,5],danger:.35,defense:-18,priceModifiers:{luxury:1.4,fuel:1.3,arms:1.24,medicine:1.22},requirement:"arms",actions:["combat","delivery","sabotage"]},
  scientificDiscovery:{duration:[3,6],danger:-.08,defense:5,priceModifiers:{data:.62,electronics:.84,components:.88},requirement:"data",actions:["survey"]}
});

function eventState(world){
  const economy=ensureEconomy(world);
  const events=economy.events??(economy.events={lastDay:0,active:{},news:[],control:{}});
  events.lastDay=Math.max(0,Math.floor(events.lastDay||0));
  events.active=events.active&&typeof events.active==="object"?events.active:{};
  events.news=Array.isArray(events.news)?events.news:[];
  events.control=events.control&&typeof events.control==="object"?events.control:{};
  return events;
}

/** Register every port in an entered system, enabling remote evolution later. */
export function registerSystemMarkets(world,system){
  if(!world||!system?.planets)return;
  for(const body of system.planets)if(body.settlement)marketQuote(world,body.settlement.id,"food",{settlement:body.settlement,body});
}

export function eventAt(world,locationId){const event=eventState(world).active[locationId];return event&&!event.resolved?event:null;}
export const eventsForSystem=(world,systemId)=>Object.values(eventState(world).active).filter(event=>event.systemId===systemId&&!event.resolved);
export const worldNews=world=>eventState(world).news.slice();

function addNews(events,entry){
  events.news.unshift(entry);events.news.length=80;
}
function scaledModifiers(template,severity){
  return Object.fromEntries(Object.entries(template.priceModifiers).map(([id,factor])=>[id,Number((1+(factor-1)*severity).toFixed(3))]));
}
function candidates(profile){
  const specialization=profile.specialization||"general";
  const bySpecialization={
    agri:["epidemic","blockade","pirateRaid","industrialBoom"], mining:["stationAccident","blockade","pirateRaid","industrialBoom"],
    industrial:["industrialBoom","stationAccident","war","blockade"], science:["scientificDiscovery","epidemic","stationAccident","pirateRaid"],
    military:["war","pirateRaid","blockade","stationAccident"], general:["blockade","pirateRaid","epidemic","industrialBoom"]
  };
  return bySpecialization[specialization]||bySpecialization.general;
}

/** Testable explicit event creation, also used by the deterministic daily scheduler. */
export function startWorldEvent(world,locationId,profile,type,severity=.6,day=ensureEconomy(world).day){
  const template=WORLD_EVENT_TYPES[type];if(!template)throw new RangeError(`Unknown event ${type}`);
  const events=eventState(world),span=template.duration[1]-template.duration[0];
  const duration=template.duration[0]+Math.floor(unit(day,String(locationId).length,Math.round(severity*100))*Math.max(1,span+1));
  const event={id:`event-${type}-${locationId}-${day}`,type,locationId,systemId:systemOf(locationId),factionId:profile.factionId||"frontier",
    startDay:day,endDay:day+duration,severity:Number(clamp(severity,.25,1).toFixed(2)),danger:template.danger,defense:template.defense,
    priceModifiers:scaledModifiers(template,severity),requirement:template.requirement,actions:[...template.actions],progress:0,resolved:false};
  events.active[locationId]=event;addNews(events,{day,type:"start",eventId:event.id,eventType:type,locationId});return event;
}

function expireEvents(world,events,day){
  for(const [locationId,event] of Object.entries(events.active))if(event.resolved||day>event.endDay){
    addNews(events,{day,type:event.resolved?"resolved":"expired",eventId:event.id,eventType:event.type,locationId});delete events.active[locationId];
  }
}
function applyPressure(world,locationId,event,profile){
  const impact=Math.max(1,Math.round(event.severity*4));
  /* The event's shortage is persistent stock state, not merely a visual price
     modifier. Delivery and NPC traffic can therefore materially recover it. */
  if(event.type!=="scientificDiscovery")changeStock(world,locationId,event.requirement,-impact,{settlement:profile});
}
function updateControl(world,events){
  const markets=ensureEconomy(world).markets;
  const groups=new Map();
  for(const [locationId,market] of Object.entries(markets)){
    const system=systemOf(locationId),profile=market.profile||{};
    const entry=groups.get(system)||{factions:{},security:0,supply:0,count:0};
    entry.factions[profile.factionId||"frontier"]=(entry.factions[profile.factionId||"frontier"]||0)+1;
    entry.security+=Number(profile.security||.5);entry.supply+=(market.stockDelta?.food||0)+(market.stockDelta?.fuel||0);entry.count++;groups.set(system,entry);
  }
  for(const [system,entry] of groups){
    const factionId=Object.entries(entry.factions).sort((a,b)=>b[1]-a[1])[0]?.[0]||"frontier";
    const eventPenalty=eventsForSystem(world,system).reduce((sum,event)=>sum+event.defense*event.severity,0);
    const defense=clamp(Math.round(entry.security/entry.count*100+entry.supply*.18+eventPenalty),0,100);
    events.control[system]={factionId,defense,supply:Math.round(entry.supply),day:ensureEconomy(world).day};
  }
}

/** Advance one or more complete days after economicTick has updated shelves. */
export function advanceWorldEvents(world,gameDay){
  const events=eventState(world),target=Math.max(events.lastDay,Math.floor(gameDay||0)),markets=ensureEconomy(world).markets;
  for(let day=events.lastDay+1;day<=target;day++){
    expireEvents(world,events,day);
    for(const [locationId,market] of Object.entries(markets)){
      if(events.active[locationId]){applyPressure(world,locationId,events.active[locationId],market.profile||{});continue;}
      const roll=unit(day,locationId.length,world.data.clusterSeed??0);
      if(roll>=.13)continue;
      const options=candidates(market.profile||{}),type=options[Math.floor(unit(day+7,locationId.length,world.data.clusterSeed??0)*options.length)];
      startWorldEvent(world,locationId,market.profile||{},type,.35+unit(day+13,locationId.length,world.data.clusterSeed??0)*.6,day);
    }
    updateControl(world,events);events.lastDay=day;
  }
  return events;
}

export const systemControl=(world,systemId)=>eventState(world).control[systemId]||{factionId:"frontier",defense:50,supply:0,day:ensureEconomy(world).day};
export const systemDanger=(world,systemId)=>clamp(eventsForSystem(world,systemId).reduce((sum,event)=>sum+event.danger*event.severity,0),0,.9);

/** Finish an event through cargo, reputation, surveying or criminal action. */
export function resolveWorldEvent(world,locationId,context,propulsion,action){
  const event=eventAt(world,locationId);if(!event||!event.actions.includes(action))return {ok:false,reason:"unavailable"};
  const finish=(reason,changes)=>{event.resolved=true;event.resolvedDay=ensureEconomy(world).day;event.resolution=action;
    changeReputation(world,context,changes,reason);addNews(eventState(world),{day:ensureEconomy(world).day,type:"resolved",eventId:event.id,eventType:event.type,locationId,action});return {ok:true,event};};
  if(action==="delivery"){
    const cargo=good(event.requirement),item=propulsion?.cargo.items.find(entry=>entry.id===cargo?.itemId),amount=Math.max(2,Math.ceil(event.severity*6));
    if(!item||item.qty<amount)return {ok:false,reason:"cargo"};
    propulsion.cargo.remove(item,amount);changeStock(world,locationId,event.requirement,amount*2,context);
    event.progress+=amount/(amount+2);if(event.progress<.65)return {ok:true,event};
    const result=finish("event relief delivery",{settlement:5,faction:4,careers:{merchant:4}});gainSkill(world,"trade",12,"event delivery");gainSkill(world,"leadership",6,"event delivery");recordStat(world,"systemsSaved",1,"event delivery");return result;
  }
  if(action==="diplomacy"){
    const rep=ensureEconomy(world).reputation?.factions?.[context.settlement?.factionId]||0;
    if(rep+Math.round(crewBonus(world,"diplomacy")*100)<20)return {ok:false,reason:"reputation"};const result=finish("event diplomacy",{settlement:4,faction:6,careers:{merchant:1,protector:2}});gainSkill(world,"diplomacy",16,"event diplomacy");gainSkill(world,"leadership",8,"event diplomacy");recordStat(world,"systemsSaved",1,"event diplomacy");return result;
  }
  if(action==="survey"){
    const probe=propulsion?.cargo.items.find(entry=>entry.id==="probe");if(!probe)return {ok:false,reason:"probe"};
    propulsion.cargo.remove(probe,1);const result=finish("event survey",{settlement:3,faction:2,careers:{researcher:6}});gainSkill(world,"research",18,"event survey");recordStat(world,"systemsSaved",1,"event survey");return result;
  }
  if(action==="sabotage"){
    const rep=ensureEconomy(world).reputation?.careers?.pirate||0;if(rep<8)return {ok:false,reason:"pirate"};
    const result=finish("event sabotage",{settlement:-4,faction:-3,careers:{pirate:5}});gainSkill(world,"combat",12,"event sabotage");recordStat(world,"systemsSabotaged",1,"event sabotage");return result;
  }
  return {ok:false,reason:"unavailable"};
}

/** Pirate kills feed the same event state instead of being a detached counter. */
export function recordEventCombat(world,locationId,context){
  const event=eventAt(world,locationId);if(!event||!event.actions.includes("combat"))return false;
  event.progress+=.55;if(event.progress<.55)return true;
  /* Combat does not need cargo/reputation. Resolve inline to avoid presenting
     a fake UI button for an action that is triggered by real destruction. */
  event.resolved=true;event.resolvedDay=ensureEconomy(world).day;event.resolution="combat";
  changeReputation(world,context,{settlement:5,faction:4,careers:{protector:6}},"event combat resolution");
  gainSkill(world,"combat",18,"event combat resolution");gainSkill(world,"leadership",5,"event combat resolution");recordStat(world,"systemsSaved",1,"event combat resolution");
  addNews(eventState(world),{day:ensureEconomy(world).day,type:"resolved",eventId:event.id,eventType:event.type,locationId,action:"combat"});
  return true;
}
