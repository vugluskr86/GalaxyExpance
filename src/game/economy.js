import { hash2i, mulberry32 } from "../core/rng.js";
import { systemId, planetId, moonId, stationId } from "../core/ids.js";
import { player } from "./player.js";
import { CATALOG, makeItem } from "./items.js";
import { factionById } from "./factions.js";
import { crewBonus, gainSkill, recordStat, skillLevel } from "./progression.js";
import { configValue } from "../config/balance.js";
import { recordTelemetry } from "./telemetry.js";

/**
 * Economy catalog.
 *
 * `itemId` is the physical crate stored in a ship's cargo Inventory. Keeping
 * the link here prevents a second, incompatible cargo system from appearing
 * in the UI. `producedBy` and `consumedBy` are deliberately data, rather than
 * a switch in the tick function: adding a new settlement type or good then
 * changes behaviour without rewriting the simulation.
 */
const CORE_GOODS=[
  { id:"food", name:"Food", itemId:"cargo_food", mass:1, basePrice:80, legality:"legal", category:"basic", producedBy:["agri"], consumedBy:["mining","industrial","military","science"] },
  { id:"water", name:"Water", itemId:"cargo_water", mass:1, basePrice:45, legality:"legal", category:"basic", producedBy:["agri"], consumedBy:["mining","industrial","military","science"] },
  { id:"medicine", name:"Medicine", itemId:"cargo_medicine", mass:1, basePrice:430, legality:"legal", category:"basic", producedBy:["science"], consumedBy:["agri","mining","industrial","military"] },
  { id:"ore", name:"Ore", itemId:"ore_fe", mass:1, basePrice:120, legality:"legal", category:"industrial", producedBy:["mining"], consumedBy:["industrial","military"] },
  { id:"rareMinerals", name:"Rare minerals", itemId:"ore_pt", mass:1, basePrice:980, legality:"controlled", category:"industrial", producedBy:["mining"], consumedBy:["science","industrial"] },
  { id:"fuel", name:"Fuel", itemId:"cargo_fuel", mass:1, basePrice:160, legality:"legal", category:"industrial", producedBy:["mining","industrial"], consumedBy:["agri","mining","industrial","military","science"] },
  { id:"electronics", name:"Electronics", itemId:"cargo_electronics", mass:1, basePrice:520, legality:"legal", category:"industrial", producedBy:["industrial","science"], consumedBy:["agri","mining","military"] },
  { id:"components", name:"Components", itemId:"cargo_components", mass:1, basePrice:340, legality:"legal", category:"industrial", producedBy:["industrial"], consumedBy:["agri","mining","military","science"] },
  { id:"arms", name:"Arms", itemId:"cargo_arms", mass:1, basePrice:860, legality:"controlled", category:"military", producedBy:["military","industrial"], consumedBy:["military"] },
  { id:"luxury", name:"Luxury goods", itemId:"cargo_luxury", mass:1, basePrice:720, legality:"legal", category:"luxury", producedBy:["agri","industrial"], consumedBy:["agri","science"] },
  { id:"data", name:"Research data", itemId:"cargo_data", mass:.2, basePrice:680, legality:"controlled", category:"data", producedBy:["science"], consumedBy:["science","industrial","military"] },
  { id:"contraband", name:"Contraband", itemId:"cargo_contraband", mass:1, basePrice:980, legality:"illegal", category:"illegal", producedBy:["mining","industrial"], consumedBy:["military"] }
];
/* Every mined physical crate participates in the same market and contract
 * pipeline as manufactured goods.  No parallel selling screen is needed. */
const MINED_IDS=/^(min_|ore_|gas_|ice_h2o$|he3$|cargo_water$)/;
const MINED_GOODS=CATALOG.filter(item=>item.slot==="cargo"&&MINED_IDS.test(item.id)).map(item=>({
  id:item.id,name:item.name,itemId:item.id,mass:item.mass,basePrice:item.price,legality:item.id==="min_uranium"?"controlled":"legal",category:"resource",producedBy:["mining"],consumedBy:["industrial","science","military"],dynamic:true
}));
export const GOODS=Object.freeze([...CORE_GOODS,...MINED_GOODS]);

export const DEFAULT_CREDITS=2500;
const goodById=id=>GOODS.find(good=>good.id===id);
const hashText=(text, seed=0)=>[...String(text)].reduce((hash,char)=>hash2i(hash,char.codePointAt(0),seed),seed|0);
const positive=value=>(value >>> 0);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** Normalize optional generator/UI data before it reaches persisted markets. */
export function marketProfileFor(settlement=null, body=null){
  const surface=body?.surface||settlement?.surface||{};
  return {
    specialization:settlement?.specialization||"general",
    security:clamp(Number(settlement?.security??.5),0,1),
    population:clamp(Number(settlement?.population??.4),.05,1),
    techLevel:clamp(Math.floor(Number(settlement?.techLevel??1)),1,5),
    minerals:clamp(Number(surface.minerals??settlement?.minerals??.35),0,1),
    vegetation:clamp(Number(surface.vegetation??settlement?.vegetation??0),0,1),
    liquid:clamp(Number(surface.liquid??settlement?.liquid??0),0,1),
    volcanism:clamp(Number(surface.volcanism??settlement?.volcanism??0),0,1),
    /* Orbital distance is a small local logistics cost now. Future stages may
       replace it with route distance without invalidating saved stock deltas. */
    distance:Math.max(0,Number(body?.dist??0)), event:settlement?.event||null,
    settlementId:settlement?.id||null,factionId:settlement?.factionId||"frontier",
    government:settlement?.government||"freeport",blackMarket:!!settlement?.blackMarket
  };
}
const produces=(good,profile)=>good.producedBy.includes(profile.specialization);
const consumes=(good,profile)=>good.consumedBy.includes(profile.specialization);

/** Deterministic local production: the generated settlement and surface
 * profile decide what an inhabited world can actually make.  No frame-time
 * or global randomness is involved, so the same seed starts with the same
 * industry; save data only stores stock deltas. */
export function productionFor(good,profile){
  const people=Math.max(1,Math.round(profile.population*4));
  const tech=.55+profile.techLevel*.22;
  const resource=.35+profile.minerals*.95;
  const biosphere=.25+profile.vegetation*.85+profile.liquid*.35;
  let factor=produces(good,profile)?1:0;
  if(good.id==="food"||good.id==="water"||good.id==="luxury")factor*=biosphere;
  if(good.id==="ore"||good.id==="rareMinerals"||good.category==="resource")factor*=resource;
  if(["components","electronics","fuel","arms"].includes(good.id))factor*=tech*(.65+profile.volcanism*.25+profile.minerals*.3);
  if(["medicine","data"].includes(good.id))factor*=tech;
  return factor>0?Math.max(1,Math.round(people*factor)):0;
}

/** Civilisations buy food and water for their population, then buy the
 * inputs their specialisation cannot provide locally. */
export function demandFor(good,profile){
  const people=Math.max(1,Math.round(profile.population*4));
  const basic=good.category==="basic"?Math.max(1,Math.round(people*(.7+profile.techLevel*.08))):0;
  const industrial=["ore","rareMinerals","fuel","electronics","components"].includes(good.id)
    && ["industrial","military","science"].includes(profile.specialization)?Math.max(1,Math.round(people*(.4+profile.techLevel*.12))):0;
  const localPenalty=produces(good,profile)?0:consumes(good,profile)?Math.max(1,Math.round(people*.7)):0;
  return basic+industrial+localPenalty;
}

export function stableSystemId(galaxy, star){
  return systemId(galaxy.def.seed,galaxy.systemSeedOf(star));
}
export const stablePlanetId=(galaxy,star,index)=>planetId(stableSystemId(galaxy,star),index);
export const stableMoonId=(galaxy,star,planetIndex,moonIndex)=>moonId(stableSystemId(galaxy,star),planetIndex,moonIndex);
export const stableStationId=(galaxy,star,index)=>stationId(stableSystemId(galaxy,star),index);

function initialEconomy(credits=configValue("economy.startCredits")){
  return { version:1, day:0, credits, transactionSeq:0, transactions:[], markets:{},
    reputation:{settlements:{},factions:{},careers:{merchant:0,protector:0,pirate:0,researcher:0},history:[]} };
}

const reputationDefault=()=>({settlements:{},factions:{},careers:{merchant:0,protector:0,pirate:0,researcher:0},history:[]});
const REP_MIN=-100,REP_MAX=100;
const normalizedRep=value=>clamp(Math.round(Number(value)||0),REP_MIN,REP_MAX);

/** Ensure and return the three independent reputation tracks in a save. */
export function reputationState(world){
  const state=ensureEconomy(world),rep=state.reputation??(state.reputation=reputationDefault());
  rep.settlements=rep.settlements&&typeof rep.settlements==="object"?rep.settlements:{};
  rep.factions=rep.factions&&typeof rep.factions==="object"?rep.factions:{};
  rep.careers={merchant:0,protector:0,pirate:0,researcher:0,...(rep.careers||{})};
  rep.history=Array.isArray(rep.history)?rep.history:[];
  return rep;
}

/** A snapshot makes pricing and access functions pure from the caller's view. */
export function reputationFor(world,context={}){
  const rep=reputationState(world),profile=marketProfileFor(context.settlement,context.body);
  return {settlement:normalizedRep(rep.settlements[profile.settlementId]),faction:normalizedRep(rep.factions[profile.factionId]),
    careers:Object.fromEntries(Object.entries(rep.careers).map(([key,value])=>[key,normalizedRep(value)]))};
}

/**
 * Mutate one or more reputation scopes. A positive anti-piracy action can
 * raise a lawful planet/faction and the protector career without affecting a
 * pirate faction elsewhere, which is the key separation required by stage 2.
 */
export function changeReputation(world,context={},changes={},reason=""){
  const rep=reputationState(world),profile=marketProfileFor(context.settlement,context.body);
  const apply=(bucket,key,amount)=>{if(!key||!amount)return;bucket[key]=normalizedRep((bucket[key]||0)+amount);};
  apply(rep.settlements,profile.settlementId,changes.settlement);
  apply(rep.factions,profile.factionId,changes.faction);
  for(const [career,amount] of Object.entries(changes.careers||{}))apply(rep.careers,career,amount);
  rep.history.unshift({day:ensureEconomy(world).day,settlementId:profile.settlementId,factionId:profile.factionId,changes:{...changes},reason});
  rep.history.length=80;
  return reputationFor(world,context);
}

/** Shared consequence helpers for combat, contracts and inspection systems. */
export const rewardProtection=(world,context,reason="protected civilian")=>changeReputation(world,context,{settlement:4,faction:3,careers:{protector:5,merchant:1}},reason);
export const rewardPiracy=(world,context,reason="piracy")=>changeReputation(world,context,{settlement:-7,faction:-6,careers:{pirate:6,merchant:-2}},reason);

/** Ensures an old save receives the compact economy state without losing data. */
export function ensureEconomy(world){
  if(!world?.data)throw new TypeError("A WorldSave is required for economy state");
  const previous=world.data.economy;
  /* A fresh generated world must not inherit the mutable module-global player
     balance (debug sessions may deliberately change it). Explicit save data
     still wins, while a new world reliably starts at the economic baseline. */
  if(!previous || typeof previous!=="object")world.data.economy=initialEconomy(world.data.player?.credits??configValue("economy.startCredits"));
  const state=world.data.economy;
  state.version=1;
  state.day=Math.max(0,Math.floor(state.day||0));
  state.credits=Math.max(0,Math.floor(state.credits??world.data.player?.credits??configValue("economy.startCredits")));
  state.transactionSeq=Math.max(0,Math.floor(state.transactionSeq||state.transactions?.length||0));
  state.transactions=Array.isArray(state.transactions)?state.transactions:[];
  state.markets=state.markets&&typeof state.markets==="object"?state.markets:{};
  return state;
}

/**
 * Base market is never stored: same seed, stable location id and generated
 * settlement profile always produce the same initial shelves. The saved
 * market contains only `stockDelta` relative to these values.
 */
export function baseMarket(world, locationId, context={}){
  const profile=marketProfileFor(context.settlement,context.body);
  const universeSeed=positive(world.data.clusterSeed??0);
  const locationSeed=hashText(locationId,universeSeed);
  return Object.fromEntries(GOODS.map((good,index)=>{
    const rng=mulberry32(hash2i(index,locationSeed,universeSeed));
    /* Producers begin with a surplus; consumers begin nearer their desired
       reserve. This makes specializations visibly different before a player
       performs the first transaction. */
    const target=configValue("economy.marketTargetBase")+Math.floor(rng()*configValue("economy.marketTargetRandom"))+
      (demandFor(good,profile)>productionFor(good,profile)?configValue("economy.consumerReserve"):0);
    const stock=Math.max(3,target-18+Math.floor(rng()*35)+(productionFor(good,profile)>demandFor(good,profile)?configValue("economy.producerSurplus"):0)-Math.min(18,demandFor(good,profile)*2));
    return [good.id,{stock,target}];
  }));
}
function marketState(world,locationId,context={}){
  const state=ensureEconomy(world);
  const market=state.markets[locationId]??(state.markets[locationId]={stockDelta:{},lastTickDay:state.day,profile:marketProfileFor(context.settlement,context.body)});
  /* A market can be opened first by a debug panel and later by a landing
     screen. Upgrade its generic profile when the concrete settlement becomes
     known; it does not alter past stock changes. */
  if(context.settlement)market.profile=marketProfileFor(context.settlement,context.body);
  return market;
}

/**
 * Checks policy before money or cargo moves. Public and black markets are
 * separate venues: a black market is not merely a price multiplier on the
 * lawful shop, so it can enforce distinct availability and risk rules.
 */
export function marketAccess(world,context={},goodId,marketKind="public"){
  const good=goodById(goodId);if(!good)throw new RangeError(`Unknown good: ${goodId}`);
  const profile=marketProfileFor(context.settlement,context.body),faction=factionById(profile.factionId);
  const rep=reputationFor(world,context);
  if(rep.settlement<=-60||rep.faction<=-75)return {ok:false,reason:"landingBan",profile,faction,rep};
  if(marketKind==="black"){
    if(!profile.blackMarket)return {ok:false,reason:"blackUnavailable",profile,faction,rep};
    return {ok:true,profile,faction,rep};
  }
  if(good.legality==="illegal"&&faction.legality!=="permissive")return {ok:false,reason:"illegal",profile,faction,rep};
  if(good.legality==="controlled"&&faction.arms!=="open"&&rep.faction<15&&rep.careers.protector<20)
    return {ok:false,reason:"license",profile,faction,rep};
  return {ok:true,profile,faction,rep};
}

/** Landing is a separate permission from market availability and is reused by SystemScene. */
export function landingAccess(world,context={}){
  if(!context.settlement)return {ok:true};
  const profile=marketProfileFor(context.settlement,context.body),rep=reputationFor(world,context);
  return rep.settlement<=-60||rep.faction<=-75 ? {ok:false,reason:"landingBan",profile,rep}:{ok:true,profile,rep};
}

/**
 * Read-only quote for UI and trade validation. Every modifier is returned
 * separately so the player can see why a price differs from the catalogue
 * average instead of receiving an unexplained random number.
 */
export function marketQuote(world,locationId,goodId,context={}){
  const good=goodById(goodId);if(!good)throw new RangeError(`Unknown good: ${goodId}`);
  const state=ensureEconomy(world),market=marketState(world,locationId,context);
  const profile=market.profile||marketProfileFor(context.settlement,context.body);
  const base=baseMarket(world,locationId,{settlement:profile})[goodId];
  const delta=Number(market.stockDelta[goodId]||0);
  const stock=Math.max(0,base.stock+delta);
  const demand=Math.max(0,base.target-stock);
  const scarcity=clamp(base.target/Math.max(1,stock),0.55,2.4);
  const specialization=produces(good,profile)?.78:(consumes(good,profile)?1.18:1);
  const security=1+(1-profile.security)*.12;
  const distance=1+clamp(profile.distance/700,0,.16);
  /* Dynamic world events are persisted in the economy state. Keeping their
     modifiers on the event record lets this pure quote stay independent of
     the event scheduler while making every price explainable in the UI. */
  const worldEvent=state.events?.active?.[locationId]||null;
  const event=(profile.event?.priceModifiers?.[goodId]??1)*(worldEvent?.priceModifiers?.[goodId]??1);
  const faction=factionById(profile.factionId),rep=reputationFor(world,context);
  const reputationDiscount=clamp((rep.settlement+rep.faction+rep.careers.merchant)/600,0,.18);
  /* Trade skill improves margins everywhere; hired brokers add a smaller
     persistent bonus. It is applied beside reputation so each price source
     remains visible and independently balanceable. */
  const skillDiscount=clamp((skillLevel(world,"trade")-1)*.025+crewBonus(world,"trade"),0,.18);
  const marketKind=context.marketKind||"public";
  const blackPremium=marketKind==="black" ? (good.legality==="illegal"?.78:.3) : 0;
  const tariff=marketKind==="black" ? 0 : faction.tariff;
  const core=Math.max(1,good.basePrice*scarcity*specialization*security*distance*event);
  const buyPrice=Math.max(1,Math.round(core*(1+tariff+blackPremium)*(1-reputationDiscount)*(1-skillDiscount)));
  const sellPrice=Math.max(1,Math.round(core*(1-tariff+blackPremium*.45)));
  return { locationId, goodId, good, basePrice:good.basePrice, stock, target:base.target, demand,
    averagePrice:good.basePrice, finalPrice:buyPrice,buyPrice,sellPrice,profile,faction,rep,marketKind,
    modifiers:[{id:"scarcity",factor:Number(scarcity.toFixed(2))},{id:"specialization",factor:specialization},{id:"security",factor:Number(security.toFixed(2))},{id:"distance",factor:Number(distance.toFixed(2))},{id:"event",factor:event,eventType:worldEvent?.type||profile.event?.id||null},{id:"tariff",factor:Number((1+tariff).toFixed(2))},{id:"reputation",factor:Number((1-reputationDiscount).toFixed(2))},{id:"skill",factor:Number((1-skillDiscount).toFixed(2))},{id:"blackMarket",factor:Number((1+blackPremium).toFixed(2))}] };
}

/** Single balance mutation API. Future trade, mission and repair code must use it. */
export function changeCredits(world, amount, details={}){
  if(!Number.isFinite(amount) || amount===0)throw new RangeError("Credit change must be a non-zero finite number");
  const state=ensureEconomy(world);const delta=Math.trunc(amount);
  if(!delta)throw new RangeError("Credit change must round to a non-zero whole credit");
  if(delta<0 && state.credits+delta<0)return null;
  state.credits+=delta;player.credits=state.credits;
  const transaction={id:`tx-${state.day}-${++state.transactionSeq}`,day:state.day,amount:delta,
    kind:details.kind||"adjustment",locationId:details.locationId||null,goodId:details.goodId||null,
    quantity:details.quantity??null,note:details.note||null};
  state.transactions.push(transaction);
  if(state.transactions.length>configValue("economy.transactionHistory"))state.transactions.splice(0,state.transactions.length-configValue("economy.transactionHistory"));
  recordTelemetry(world,"credits",{amount:delta,credits:state.credits,kind:transaction.kind},{locationId:transaction.locationId});
  return transaction;
}

/** Applies a persistent stock change. Used by trade now and by production later. */
export function changeStock(world,locationId,goodId,amount,context={}){
  if(!goodById(goodId))throw new RangeError(`Unknown good: ${goodId}`);
  if(!Number.isFinite(amount) || amount===0)throw new RangeError("Stock change must be a non-zero finite number");
  const market=marketState(world,locationId,context);
  const current=marketQuote(world,locationId,goodId,context);
  const requested=Math.trunc(amount);if(!requested)throw new RangeError("Stock change must round to a non-zero whole unit");
  const applied=Math.max(-current.stock,requested);
  market.stockDelta[goodId]=(market.stockDelta[goodId]||0)+applied;
  return applied;
}

/**
 * Purchase and sale are deliberately the only functions which move a market
 * crate into or out of the player's cargo. They validate every limit before
 * mutating state, then record the credit leg in the common transaction journal.
 * A later NPC trader can call the same lower-level quote/stock functions.
 */
export function buyGoods(world,locationId,context,propulsion,goodId,quantity=1){
  const good=goodById(goodId);if(!good)throw new RangeError(`Unknown good: ${goodId}`);
  const qty=Math.max(0,Math.floor(quantity));if(!qty)return {ok:false,reason:"quantity"};
  const access=marketAccess(world,context,goodId,context.marketKind||"public");
  if(!access.ok)return {ok:false,reason:access.reason};
  const quote=marketQuote(world,locationId,goodId,context);
  const capacity=Math.floor(Math.max(0,propulsion.cargoCap-propulsion.cargoMass)/good.mass);
  /* A legacy save can already be over its hull take-off limit. It must still
     be able to trade while docked; departure remains blocked by Propulsion's
     own overload rule. Only a currently flyable ship has its purchase capped
     by the remaining launch mass. */
  const flightCapacity=propulsion.mass>propulsion.maxTakeoffMass
    ? capacity:Math.floor(Math.max(0,propulsion.maxTakeoffMass-propulsion.mass)/good.mass);
  const accepted=Math.min(qty,quote.stock,capacity,flightCapacity);
  if(!accepted)return {ok:false,reason:quote.stock<=0?"stock":flightCapacity<=0?"overload":"capacity",quote};
  const total=quote.buyPrice*accepted;
  if(ensureEconomy(world).credits<total)return {ok:false,reason:"credits",quote};
  /* Debit first. It cannot fail after the balance pre-check above; should a
     future rule reject it, no cargo or stock mutation has happened yet. */
  const transaction=changeCredits(world,-total,{kind:"market-buy",locationId,goodId,quantity:accepted,note:`buy ${accepted} ${goodId}`});
  changeStock(world,locationId,goodId,-accepted,context);
  propulsion.cargo.add(makeItem(good.itemId,accepted));
  changeReputation(world,context,context.marketKind==="black"
    ? {careers:{pirate:1}} : {settlement:1,faction:1,careers:{merchant:1}},context.marketKind==="black"?"black market trade":"lawful trade");
  gainSkill(world,"trade",Math.max(1,Math.floor(total/800)),"market purchase");
  recordStat(world,"tradeProfit",-total,"market purchase");recordStat(world,"tradeVolume",accepted,"market purchase");
  return {ok:true,quantity:accepted,total,quote,transaction};
}

export function sellGoods(world,locationId,context,propulsion,goodId,quantity=1){
  const good=goodById(goodId);if(!good)throw new RangeError(`Unknown good: ${goodId}`);
  const qty=Math.max(0,Math.floor(quantity));if(!qty)return {ok:false,reason:"quantity"};
  const carried=propulsion.cargo.items.find(item=>item.id===good.itemId);
  const accepted=Math.min(qty,carried?.qty||0);
  if(!accepted)return {ok:false,reason:"cargo"};
  const access=marketAccess(world,context,goodId,context.marketKind||"public");
  if(!access.ok)return {ok:false,reason:access.reason};
  const quote=marketQuote(world,locationId,goodId,context);
  const total=quote.sellPrice*accepted;
  /* Remove exactly the accepted stack fragment. Inventory.remove keeps the
     rest of a stack in place, which matters when selling only one tonne. */
  propulsion.cargo.remove(carried,accepted);
  changeStock(world,locationId,goodId,accepted,context);
  const transaction=changeCredits(world,total,{kind:"market-sell",locationId,goodId,quantity:accepted,note:`sell ${accepted} ${goodId}`});
  changeReputation(world,context,context.marketKind==="black"
    ? {careers:{pirate:1}} : {settlement:1,faction:1,careers:{merchant:1}},context.marketKind==="black"?"black market trade":"lawful trade");
  gainSkill(world,"trade",Math.max(1,Math.floor(total/650)),"market sale");
  recordStat(world,"tradeProfit",total,"market sale");recordStat(world,"tradeVolume",accepted,"market sale");
  return {ok:true,quantity:accepted,total,quote,transaction};
}

/**
 * Deterministic inspection outcome for a black-market transaction. The roll
 * uses saved day/transaction sequence, never Math.random(), so reloads cannot
 * be used to reroll a confiscation. A caught cargo is removed and the same
 * reputation API records the social consequence.
 */
export function resolveBlackMarketRisk(world,context,propulsion,goodId,quantity){
  if((context.marketKind||"public")!=="black"||goodId!=="contraband")return {caught:false};
  const profile=marketProfileFor(context.settlement,context.body),state=ensureEconomy(world);
  const roll=(positive(hashText(`${profile.settlementId}:${state.day}:${state.transactionSeq}`,world.data.clusterSeed??0))%1000)/1000;
  const chance=.04+profile.security*.16;
  if(roll>=chance)return {caught:false,chance};
  const item=propulsion.cargo.items.find(entry=>entry.id===goodById(goodId).itemId);
  const seized=Math.min(item?.qty||0,Math.max(1,quantity||1));
  if(seized)propulsion.cargo.remove(item,seized);
  const fine=Math.min(state.credits,Math.max(80,Math.round(goodById(goodId).basePrice*seized*.35)));
  if(fine)changeCredits(world,-fine,{kind:"contraband-fine",locationId:profile.settlementId,goodId,quantity:seized,note:"inspection fine"});
  changeReputation(world,context,{settlement:-8,faction:-7,careers:{pirate:2,merchant:-2}},"contraband confiscated");
  return {caught:true,chance,seized,fine};
}

/**
 * Advances only complete game days. It is deliberately called by game events
 * (currently hyperspace travel), never by a scene's update/render loop.
 */
export function economicTick(world,gameDay){
  const state=ensureEconomy(world);const target=Math.max(state.day,Math.floor(gameDay||0));
  for(let day=state.day+1;day<=target;day++){
    for(const [locationId,market] of Object.entries(state.markets)){
      const profile=market.profile||marketProfileFor();
      const baseline=baseMarket(world,locationId,{settlement:profile});
      for(const good of GOODS){
        const current=baseline[good.id].stock+(market.stockDelta[good.id]||0);
        /* Local production fills shelves; consumption removes stock. A small
           pull toward the generated reserve prevents an unattended market
           from drifting infinitely far after a temporary imbalance. */
        const production=productionFor(good,profile);
        const consumption=demandFor(good,profile);
        const recovery=Math.sign(baseline[good.id].target-current);
        const delta=production-consumption+(recovery&&Math.abs(current-baseline[good.id].target)>18?recovery:0);
        const ceiling=baseline[good.id].target*3;
        const next=clamp(current+delta,0,ceiling);
        market.stockDelta[good.id]=next-baseline[good.id].stock;
      }
      market.lastTickDay=day;
    }
  }
  state.day=target;
  return state.day;
}

export const economicDay=world=>ensureEconomy(world).day;
