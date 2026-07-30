import { GOODS, changeCredits, changeReputation, ensureEconomy, marketQuote } from "./economy.js";
import { hash2i } from "../core/rng.js";
import { eventAt } from "./events.js";
import { crewBonus, gainSkill, recordStat, skillLevel } from "./progression.js";

/**
 * Contract layer deliberately stores only player-visible state (offered,
 * active, completed, failed or claimed). Offers themselves are derived from a
 * market quote, security and a generated event, so an untouched settlement
 * never needs a permanently saved quest list.
 */
const MAX_CONTRACTS=120;
const byGood=id=>GOODS.find(good=>good.id===id);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const contractState=world=>{
  const economy=ensureEconomy(world);
  const state=economy.contracts??(economy.contracts={sequence:0,items:[]});
  state.sequence=Math.max(0,Math.floor(state.sequence||0));
  state.items=Array.isArray(state.items)?state.items:[];
  return state;
};
const profileOf=context=>({settlement:context?.settlement||null,body:context?.body||null});
const keyPart=value=>String(value||"unknown").replaceAll(/[^a-zA-Z0-9_-]/g,"_");

export const contractsAt=(world,locationId,states=["offered","active"])=>
  contractState(world).items.filter(contract=>states.includes(contract.state)&&(contract.issuerId===locationId||contract.destinationId===locationId));

/** Public route marker query for galaxy map; hidden-market work stays hidden. */
export const contractsForSystem=(world,system)=>contractState(world).items.filter(contract=>
  contract.state==="active"&&contract.visibility!=="black-market"&&
  (contract.issuerId?.startsWith(system)||contract.destinationId?.startsWith(system)));

/**
 * Add an offer only if its deterministic slot is empty. A shortage thus
 * continuously advertises the same work until someone accepts, claims or
 * resolves it, rather than emitting a new quest every panel refresh.
 */
function offer(world,locationId,context,spec){
  const state=contractState(world),day=ensureEconomy(world).day;
  const id=`contract-${keyPart(locationId)}-${spec.type}-${spec.goodId||"none"}-${day}`;
  const existing=state.items.find(contract=>contract.issuerId===locationId&&contract.type===spec.type&&contract.cargo[0]?.goodId===(spec.goodId||undefined)&&["offered","active"].includes(contract.state));
  if(existing)return existing;
  const contract={id,issuerId:locationId,type:spec.type,originId:spec.originId||null,destinationId:spec.destinationId||locationId,
    cargo:spec.goodId?[{goodId:spec.goodId,amount:spec.amount}]:[],deadline:day+spec.deadline,reward:spec.reward,
    deposit:spec.deposit||0,risk:spec.risk,visibility:spec.visibility||"public",state:"offered",createdDay:day,
    factionId:context.settlement?.factionId||"frontier",settlementId:context.settlement?.id||locationId,
    title:spec.title,progress:0};
  state.items.push(contract);
  if(state.items.length>MAX_CONTRACTS)state.items.splice(0,state.items.length-MAX_CONTRACTS);
  return contract;
}

/**
 * Produce offers from the actual stock deficit. Delivery contracts need the
 * stated cargo at the same destination; a player must source it in another
 * system. Combat, survey and rescue contracts use the same common schema.
 */
export function generateContracts(world,locationId,context={}){
  const settlement=context.settlement;if(!settlement)return [];
  const profile=profileOf(context),event=eventAt(world,locationId)||settlement.event;
  const quotes=GOODS.map(good=>marketQuote(world,locationId,good.id,profile));
  const shortage=[...quotes].sort((a,b)=>b.demand-a.demand)[0];
  const offers=[];
  if(shortage?.demand>4){
    const amount=clamp(Math.ceil(shortage.demand/3),3,12);
    offers.push(offer(world,locationId,context,{type:"delivery",goodId:shortage.goodId,amount,deadline:8,risk:.15,
      reward:Math.round(shortage.buyPrice*amount*1.45),title:"delivery"}));
  }
  if((event||shortage?.demand>18)&&shortage){
    const amount=clamp(Math.ceil(shortage.demand/2),5,18);
    offers.push(offer(world,locationId,context,{type:"urgent-delivery",goodId:shortage.goodId,amount,deadline:3,risk:.35,
      reward:Math.round(shortage.buyPrice*amount*2.1),title:"urgentDelivery"}));
  }
  if(settlement.security<.72)offers.push(offer(world,locationId,context,{type:"escort",deadline:6,risk:1-settlement.security,
    reward:Math.round(700+1400*(1-settlement.security)),title:"escort"}));
  if(settlement.security<.52)offers.push(offer(world,locationId,context,{type:"bounty",deadline:7,risk:1-settlement.security,
    reward:Math.round(1200+2100*(1-settlement.security)),title:"bounty"}));
  const medicine=quotes.find(quote=>quote.goodId==="medicine");
  if(event?.id==="shortage"||medicine?.demand>12)offers.push(offer(world,locationId,context,{type:"rescue",goodId:"medicine",amount:3,deadline:4,risk:.45,
    reward:Math.round((medicine?.buyPrice||430)*5),title:"rescue"}));
  if(settlement.specialization==="science"||settlement.techLevel>=4)offers.push(offer(world,locationId,context,{type:"survey",goodId:"data",amount:1,deadline:10,risk:.25,
    reward:1500+settlement.techLevel*400,title:"survey"}));
  if(settlement.blackMarket)offers.push(offer(world,locationId,context,{type:"smuggling",goodId:"contraband",amount:3,deadline:5,risk:.7,
    reward:4200,title:"smuggling",visibility:"black-market"}));
  /* Events advertise work with a concrete alternate resolution. The normal
     contract layer stays source-of-truth for rewards/deadlines, while the
     station event panel can resolve the same pressure directly. */
  if(event?.type==="pirateRaid"||event?.type==="blockade")offers.push(offer(world,locationId,context,{type:"bounty",deadline:Math.max(2,event.endDay-ensureEconomy(world).day),risk:Math.min(.95,.35+event.severity),
    reward:Math.round(1900+event.severity*3400),title:"bounty"}));
  if(event?.type==="scientificDiscovery"||event?.type==="stationAccident")offers.push(offer(world,locationId,context,{type:"survey",goodId:"data",amount:1,deadline:Math.max(3,event.endDay-ensureEconomy(world).day),risk:event.severity*.45,
    reward:Math.round(1600+event.severity*2600),title:"survey"}));
  return offers.filter(Boolean);
}

export function acceptContract(world,id){
  const contract=contractState(world).items.find(item=>item.id===id);
  if(!contract||contract.state!=="offered")return {ok:false,reason:"unavailable"};
  contract.state="active";contract.acceptedDay=ensureEconomy(world).day;
  return {ok:true,contract};
}

function takeCargo(propulsion,goodId,amount){
  const good=byGood(goodId),item=propulsion?.cargo.items.find(entry=>entry.id===good?.itemId);
  if(!good||!item||item.qty<amount)return false;
  propulsion.cargo.remove(item,amount);return true;
}

/** Complete a delivery-like contract at its destination; no UI code mutates it directly. */
export function completeContract(world,id,locationId,context,propulsion){
  const contract=contractState(world).items.find(item=>item.id===id);
  if(!contract||contract.state!=="active")return {ok:false,reason:"unavailable"};
  if(contract.destinationId!==locationId)return {ok:false,reason:"wrongDestination"};
  const requirement=contract.cargo[0];
  if(requirement&&!takeCargo(propulsion,requirement.goodId,requirement.amount))return {ok:false,reason:"cargo"};
  if(["escort","bounty"].includes(contract.type)&&contract.progress<1)return {ok:false,reason:"progress"};
  contract.state="completed";contract.completedDay=ensureEconomy(world).day;
  const leadershipBonus=1+(skillLevel(world,"leadership")-1)*.035+crewBonus(world,"leadership");
  const reward=Math.round(contract.reward*leadershipBonus);
  changeCredits(world,reward,{kind:"contract-reward",locationId,goodId:requirement?.goodId||null,quantity:requirement?.amount||null,note:contract.type});
  const careers=contract.type==="smuggling"?{pirate:4}:contract.type==="survey"?{researcher:4}:contract.type==="bounty"||contract.type==="escort"?{protector:4}:{merchant:4};
  changeReputation(world,context,{settlement:4,faction:3,careers},`contract ${contract.type} completed`);
  const skill=contract.type==="survey"?"research":contract.type==="bounty"||contract.type==="escort"?"combat":contract.type==="smuggling"?"diplomacy":"trade";
  gainSkill(world,skill,8+Math.floor(contract.risk*12),`contract ${contract.type}`);
  gainSkill(world,"leadership",3+Math.floor(contract.risk*5),`contract ${contract.type}`);
  recordStat(world,"contractsCompleted",1,contract.type);recordStat(world,"contractProfit",reward,contract.type);
  contract.rewardPaid=reward;
  return {ok:true,contract};
}

/** Combat systems call this once on a meaningful event, not every animation frame. */
export function progressContracts(world,locationId,eventType){
  for(const contract of contractState(world).items){
    if(contract.state!=="active"||contract.destinationId!==locationId)continue;
    if(eventType==="pirate-eliminated"&&(contract.type==="bounty"||contract.type==="escort"))contract.progress=1;
  }
}

/**
 * Time advances contracts discretely with the same game day as the economy.
 * Ignored public offers can be claimed by NPCs; active contracts fail after a
 * deadline and apply a small, local reputation consequence.
 */
export function advanceContracts(world,gameDay){
  const state=contractState(world),seed=world.data.clusterSeed??0;
  for(const contract of state.items){
    if(contract.state==="active"&&gameDay>contract.deadline){
      contract.state="failed";contract.failedDay=gameDay;
      changeReputation(world,{settlement:{id:contract.settlementId,factionId:contract.factionId}},{settlement:-3,faction:-2,careers:{merchant:-1}},"contract deadline missed");
    }else if(contract.state==="offered"&&gameDay-contract.createdDay>=2){
      const roll=((hash2i(gameDay,contract.id.length,seed)>>>0)%100)/100;
      if(roll<.35){contract.state="claimed";contract.claimedDay=gameDay;contract.claimedBy="npc";}
    }
  }
}
