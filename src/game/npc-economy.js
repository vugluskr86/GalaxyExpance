import { GOODS, changeStock, marketQuote } from "./economy.js";
import { makeItem } from "./items.js";

/**
 * Economic state machine for ships in the currently simulated system.
 *
 * It never runs from drawing code. A trader changes a market only at two
 * discrete moments: loading a crate at origin and unloading it at destination.
 * The route itself is saved on the NPC, so re-entering a system resumes a
 * shipment instead of creating free cargo every time.
 */
const ctx=body=>({settlement:body?.settlement,body});
const settlements=sys=>sys.S.planets.map((body,index)=>({body,index,...ctx(body)})).filter(entry=>entry.settlement);
const same=(a,b)=>a&&b&&a.kind===b.kind&&a.i===b.i&&a.j===b.j;
const cargoGood=id=>GOODS.find(good=>good.id===id);

function bestRoute(sys,npc){
  const ports=settlements(sys);if(ports.length<2)return null;
  let best=null;
  for(const origin of ports)for(const destination of ports){
    if(origin===destination||origin.settlement.id===destination.settlement.id)continue;
    for(const good of GOODS.filter(item=>item.legality!=="illegal"&&item.producedBy.includes(origin.settlement.specialization))){
      const buy=marketQuote(sys.world,origin.settlement.id,good.id,origin).buyPrice;
      const sell=marketQuote(sys.world,destination.settlement.id,good.id,destination).sellPrice;
      const qty=Math.max(1,Math.min(8,Math.floor(npc.ship.prop.cargoCap/good.mass)));
      const profit=(sell-buy)*qty;
      if(!best||profit>best.estimatedProfit)best={kind:"trade",state:"toOrigin",originId:origin.settlement.id,destinationId:destination.settlement.id,
        originRef:{kind:"planet",i:origin.index,j:0},destinationRef:{kind:"planet",i:destination.index,j:0},goodId:good.id,quantity:qty,estimatedProfit:profit,deliveries:0};
    }
  }
  return best;
}

function load(route,npc,sys){
  const good=cargoGood(route.goodId),origin=sys.S.planets[route.originRef.i];if(!good||!origin?.settlement)return false;
  const quote=marketQuote(sys.world,route.originId,good.id,ctx(origin));
  const amount=Math.min(route.quantity,quote.stock);
  if(!amount)return false;
  changeStock(sys.world,route.originId,good.id,-amount,ctx(origin));
  npc.ship.prop.cargo.add(makeItem(good.itemId,amount));
  route.quantity=amount;route.state="toDestination";route.loaded=true;
  npc.agent.remember("cargo-load",{goodId:good.id,amount,origin:route.originId});
  return true;
}

function unload(route,npc,sys){
  const good=cargoGood(route.goodId),destination=sys.S.planets[route.destinationRef.i];if(!good||!destination?.settlement)return false;
  const item=npc.ship.prop.cargo.items.find(entry=>entry.id===good.itemId),amount=Math.min(route.quantity,item?.qty||0);
  if(!amount)return false;
  npc.ship.prop.cargo.remove(item,amount);
  changeStock(sys.world,route.destinationId,good.id,amount,ctx(destination));
  const earned=Math.max(0,Math.round(route.estimatedProfit*(amount/Math.max(1,route.quantity))));
  npc.agent.state.credits+=earned;route.deliveries=(route.deliveries||0)+1;route.state="complete";
  npc.agent.remember("cargo-delivery",{goodId:good.id,amount,destination:route.destinationId,earned});
  return true;
}

/** Assign durable, role-appropriate economic state after restoring a system. */
export function initializeNpcEconomy(sys){
  if(!sys.world)return;
  for(const npc of sys.npcs){
    if(npc.economy)continue;
    const profile=npc.agent.profileId;
    if(profile==="trader"||profile==="courier")npc.economy=bestRoute(sys,npc)||{kind:"trade",state:"idle"};
    else if(profile==="patrol"||profile==="ranger"){
      const trader=sys.npcs.find(other=>other!==npc&&["trader","courier"].includes(other.agent.profileId));
      npc.economy={kind:"escort",state:trader?"escort":"patrol",targetName:trader?.name||null};
    }else if(profile==="pirate")npc.economy={kind:"raid",state:"search"};
    else npc.economy={kind:profile==="geologist"?"survey":"service",state:"idle"};
  }
}

/**
 * Advance a single ship's route. The current physical simulation determines
 * arrival (`newton` around the requested primary); we only react to that
 * state transition and then command the next FSD leg.
 */
export function updateNpcEconomy(npc,sys){
  const route=npc.economy;if(!route||route.kind!=="trade"||!sys.world)return false;
  const ship=npc.ship;
  if(route.state==="idle"||route.state==="complete"){
    npc.economy=bestRoute(sys,npc)||{kind:"trade",state:"idle"};return false;
  }
  if(route.state==="toOrigin"){
    if(!same(ship.primary,route.originRef)||ship.mode!=="newton"){if(ship.mode!=="cruise"||!same(ship.target,route.originRef))ship.fsdTo(route.originRef,16);return false;}
    if(!load(route,npc,sys)){route.state="complete";return false;}
    ship.fsdTo(route.destinationRef,16);return true;
  }
  if(route.state==="toDestination"){
    if(!same(ship.primary,route.destinationRef)||ship.mode!=="newton"){if(ship.mode!=="cruise"||!same(ship.target,route.destinationRef))ship.fsdTo(route.destinationRef,16);return false;}
    return unload(route,npc,sys);
  }
  return false;
}

/** The pirate values cargo but discounts targets likely to defeat it. */
export function valuableRaidTarget(npc,sys){
  const own=npc.ship,ownStrength=(own.integrity||100)+(own.prop.shield?.charge||0);
  const targets=[sys.playerShip,...sys.npcs.filter(other=>other!==npc&&other.agent.config.faction!=="pirate").map(other=>other.ship)].filter(Boolean);
  return targets.map(target=>{
    const cargo=target.prop?.cargo.items.reduce((sum,item)=>sum+(item.def.price||0)*item.qty,0)||0;
    const defense=(target.integrity||100)+(target.prop?.shield?.charge||0);
    const [ax,ay]=own.globPos(sys),[bx,by]=target.globPos(sys);
    return {target,score:(cargo+300)/(1+defense/Math.max(1,ownStrength))*1/Math.max(1,Math.hypot(ax-bx,ay-by)/40)};
  }).sort((a,b)=>b.score-a.score)[0]?.target||null;
}

/** A destroyed hauler never delivers its cargo: destination stock worsens. */
export function onNpcDestroyed(npc,sys){
  const route=npc?.economy;if(!route||route.kind!=="trade"||route.state!=="toDestination"||!sys.world)return;
  const destination=sys.S.planets[route.destinationRef.i];
  if(destination?.settlement)changeStock(sys.world,route.destinationId,route.goodId,-Math.max(1,Math.floor(route.quantity*.5)),ctx(destination));
}

/** Called from the discrete game-day hook to refresh idle routes only. */
export function economicNpcTick(sys){
  initializeNpcEconomy(sys);
  for(const npc of sys.npcs)if(npc.economy?.kind==="trade"&&(npc.economy.state==="idle"||npc.economy.state==="complete"))npc.economy=bestRoute(sys,npc)||npc.economy;
}
